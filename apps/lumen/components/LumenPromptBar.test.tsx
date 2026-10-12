import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PromptBar, { type PromptBarCommand } from "@lumen/ui/primitives/PromptBar";

const commands: PromptBarCommand[] = [
  { key: "three-d", name: "/3d", desc: "Schakel van renderer", value: "Open de 3D-weergave" },
];

function ControlledPrompt({ onSubmit = vi.fn(), onVoice = vi.fn() }: { onSubmit?: (value: string) => void; onVoice?: () => void }) {
  return (
    <PromptBar
      demo={false}
      ariaLabel="Geef Lumen een opdracht"
      onSend={onSubmit}
      onDictation={onVoice}
      onToggleHistory={vi.fn()}
      effects={false}
      commands={commands}
      models={[{ key: "local", name: "Lokaal", tag: "Opdrachten" }]}
      sources={[{ key: "map", name: "Huidige kaart", desc: "De open wereld", value: "@huidige-kaart", glyph: "globe" }]}
    />
  );
}

describe("LumenPromptBar", () => {
  it("submits with Enter and preserves Shift+Enter for multiline input", () => {
    const onSubmit = vi.fn();
    render(<ControlledPrompt onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: "Geef Lumen een opdracht" });

    fireEvent.change(input, { target: { value: "Bekijk deze plek" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("Bekijk deze plek");
  });

  it("filters and inserts slash commands with the keyboard", () => {
    render(<ControlledPrompt />);
    const input = screen.getByRole("textbox", { name: "Geef Lumen een opdracht" });

    fireEvent.change(input, { target: { value: "/3" } });
    expect(screen.getByRole("button", { name: /\/3d/i })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue("Open de 3D-weergave ");
  });

  it("exposes current context through the context menu", () => {
    render(<ControlledPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "Add attachments and sources" }));
    expect(screen.getByRole("button", { name: /Huidige kaart/i })).toBeInTheDocument();
    expect(screen.getByText("De open wereld")).toBeInTheDocument();
  });

  it("keeps voice as an explicit provider-independent action", () => {
    const onVoice = vi.fn();
    render(<ControlledPrompt onVoice={onVoice} />);
    fireEvent.click(screen.getByRole("button", { name: "Start spraakbediening" }));
    expect(onVoice).toHaveBeenCalledOnce();
  });

  it("reflects externally controlled recording state", () => {
    render(<PromptBar demo={false} onDictation={vi.fn()} dictationState="recording" effects={false} />);
    expect(screen.getByRole("button", { name: "Stop spraakopname" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("Luisteren…")).toBeInTheDocument();
  });

  it("replaces only the input lane with the supplied loading state", () => {
    render(
      <PromptBar
        demo={false}
        ariaLabel="Geef Lumen een opdracht"
        busy
        loadingContent={<span role="status">Lumen werkt</span>}
        effects={false}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Geef Lumen een opdracht" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Lumen werkt");
    expect(screen.getByRole("button", { name: "Bezig met opdracht" })).toBeDisabled();
  });
});
