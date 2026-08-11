import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { resolveVoiceReadbackText } from "@/components/VoiceTape";
import { releaseReadback } from "@/hooks/useVoiceAllocation";

describe("voice readback client", () => {
  it("reads the current typed instruction when dictation and allocation readback are absent", () => {
    expect(resolveVoiceReadbackText(null, "", "  Alex had the curry and shared the naan.  ")).toBe(
      "Alex had the curry and shared the naan.",
    );
  });

  it("prefers a final dictation transcript over the editable instruction", () => {
    expect(resolveVoiceReadbackText(undefined, "  Final dictated allocation.  ", "Current typed allocation.")).toBe(
      "Final dictated allocation.",
    );
  });

  it("keeps the existing allocation readback authoritative over transcript and instruction", () => {
    expect(
      resolveVoiceReadbackText(
        "  Allocation reconciled to the cent.  ",
        "Final dictated allocation.",
        "Current typed allocation.",
      ),
    ).toBe("Allocation reconciled to the cent.");
  });

  it("pauses audio and revokes the prepared blob URL during readback cleanup", () => {
    const pause = vi.fn();
    const audio = { onended: vi.fn(), onerror: vi.fn(), pause } as unknown as HTMLAudioElement;
    const audioRef = { current: audio };
    const urlRef = { current: "blob:https://finaltab.example/readback" };
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    releaseReadback(audioRef, urlRef, true);

    expect(pause).toHaveBeenCalledOnce();
    expect(audio.onended).toBeNull();
    expect(audio.onerror).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:https://finaltab.example/readback");
    expect(audioRef.current).toBeNull();
    expect(urlRef.current).toBeNull();
    revokeObjectURL.mockRestore();
  });

  it("offers the prepared clip as a named accessible download", () => {
    const component = readFileSync(
      fileURLToPath(new URL("../components/VoiceTape.tsx", import.meta.url)),
      "utf8",
    );

    expect(component).toContain("readback.downloadUrl");
    expect(component).toContain('download="finaltab-readback.mp3"');
    expect(component).toContain('aria-label="Download prepared voice readback clip"');
    expect(component).toContain("Download clip");
  });
});
