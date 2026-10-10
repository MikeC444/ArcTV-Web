import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Stream } from "../../domain/types";
import { downloadOptions } from "../../state/downloadSources";
import { DownloadPanel } from "./DownloadPanel";

const stream: Stream = {
  id: "s1", providerId: "p", providerLabel: "Addon", resolutionTier: "FHD_1080P", qualityBadge: "1080p", releaseTitle: "Movie.2024.1080p.WEB-DL",
  url: "https://cdn.example.com/d/abc/Movie.2024.1080p.mkv", sizeLabel: "2.4 GB", codec: "H.264", debrid: { service: "TB", cached: true },
};
const target = { type: "MOVIE" as const, id: "tt1", season: null, episode: null };

describe("DownloadPanel", () => {
  it("lists the files as plain download links once the lookup finishes", async () => {
    render(<DownloadPanel target={target} title="Movie" onClose={() => {}} load={async () => downloadOptions([stream])} />);
    expect(screen.getByText("Finding files…")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: /Download 1080p Movie\.2024\.1080p\.WEB-DL, 2\.4 GB/ });
    expect(link).toHaveAttribute("href", "https://cdn.example.com/d/abc/Movie.2024.1080p.mkv");
    expect(link).toHaveAttribute("download", "Movie.2024.1080p.WEB-DL.mkv");
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    await waitFor(() => expect(link).toHaveFocus());
  });

  it("says so when nothing can be downloaded, also when the lookup fails", async () => {
    const { unmount } = render(<DownloadPanel target={target} title="Movie" onClose={() => {}} load={async () => []} />);
    expect(await screen.findByText(/No downloadable files found/)).toBeInTheDocument();
    unmount();
    render(<DownloadPanel target={target} title="Movie" onClose={() => {}} load={() => Promise.reject(new Error("x"))} />);
    expect(await screen.findByText(/No downloadable files found/)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<DownloadPanel target={target} title="Movie" onClose={onClose} load={async () => []} />);
    await screen.findByText(/No downloadable files found/);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalled();
  });
});
