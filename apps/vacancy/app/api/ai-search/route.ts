import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

function resolveRepoRoot() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "services", "nls"))) {
    return cwd;
  }
  const candidate = path.resolve(cwd, "..", "..");
  if (existsSync(path.join(candidate, "services", "nls"))) {
    return candidate;
  }
  return cwd;
}

function readEnvFileValue(key: string) {
  const repoRoot = resolveRepoRoot();
  const envPath = path.join(repoRoot, "apps", "vacancy", ".env");
  if (!existsSync(envPath)) return "";

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const [name, ...rest] = line.split("=");
    if (!name || name.trim() !== key) continue;
    return rest.join("=").trim();
  }
  return "";
}

async function checkPythonDependencies(repoRoot: string) {
  try {
    await execFileAsync(
      "python3",
      [
        "-c",
        "import importlib;mods=['psycopg','pgvector','sentence_transformers'];missing=[m for m in mods if importlib.util.find_spec(m) is None];print(','.join(missing))",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PYTHONPATH: repoRoot,
        },
      },
    );
    const { stdout } = await execFileAsync(
      "python3",
      [
        "-c",
        "import importlib;mods=['psycopg','pgvector','sentence_transformers'];missing=[m for m in mods if importlib.util.find_spec(m) is None];print(','.join(missing))",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PYTHONPATH: repoRoot,
        },
      },
    );
    return stdout.trim();
  } catch {
    return "python3";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const gemeenteCode = searchParams.get("gemeenteCode")?.trim();
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? "8"), 1),
    20,
  );

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter 'q' is verplicht." },
      { status: 400 },
    );
  }

  const databaseUrl =
    process.env.DATABASE_URL || readEnvFileValue("DATABASE_URL");
  if (!databaseUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL ontbreekt voor AI search." },
      { status: 503 },
    );
  }

  const repoRoot = resolveRepoRoot();
  const missingDeps = await checkPythonDependencies(repoRoot);
  if (missingDeps) {
    return NextResponse.json(
      {
        error: `Python dependency ontbreekt voor AI search: ${missingDeps}. Installeer minimaal psycopg, pgvector en sentence_transformers.`,
      },
      { status: 503 },
    );
  }

  const args = [
    "-m",
    "services.nls.search_bag",
    query,
    "--database-url",
    databaseUrl,
    "--limit",
    String(limit),
  ];

  if (gemeenteCode) {
    args.push("--gemeente-code", gemeenteCode);
  }

  try {
    const { stdout, stderr } = await execFileAsync("python3", args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        PYTHONPATH: repoRoot,
      },
      maxBuffer: 1024 * 1024 * 8,
    });

    if (stderr?.trim()) {
      console.error("AI search stderr:", stderr);
    }

    const parsed = JSON.parse(stdout) as {
      query: string;
      results: unknown[];
      filters?: Record<string, unknown>;
    };

    return NextResponse.json(parsed);
  } catch (error) {
    const details = [
      (error as { stderr?: string }).stderr,
      (error as { stdout?: string }).stdout,
      (error as Error).message,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    console.error("AI search failed:", error);
    return NextResponse.json(
      {
        error: details.includes("failed to resolve host")
          ? "AI search kan de databasehost niet bereiken vanuit deze runtime. Controleer netwerktoegang of de DATABASE_URL host."
          : details.includes("embedding model could not be loaded from Hugging Face") ||
              details.includes("currently cannot download the model")
            ? "AI search kan het embedding-model niet laden in deze runtime. Geef de server eenmalig toegang tot Hugging Face, of zet NLS_EMBED_MODEL naar een lokale modelmap."
          : details.includes("pgvector extension enabled") ||
              details.includes("NLS schema is incomplete") ||
              details.includes("bag_search_hybrid")
            ? "AI search database is nog niet gebootstrapped. Voer services/nls/sql/001_pgvector_bag_search.sql uit op de target database."
          : details || "AI search kon niet worden uitgevoerd.",
      },
      { status: 500 },
    );
  }
}
