import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const link = await screen.findByRole("link", { name: /Download 1080p WEB-DL, Movie\.2024\.1080p\.WEB-DL, 2\.4 GB/ });
    expect(link).toHaveAttribute("href", "https://cdn.example.com/d/abc/Movie.2024.1080p.mkv");
    expect(link).toHaveAttribute("download", "Movie.2024.1080p.WEB-DL.mkv");
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    await waitFor(() => expect(link).toHaveFocus());
  });

  it("shows the title, the count and the automatic order, with no sort or filter controls", async () => {
    render(<DownloadPanel target={target} title="Movie" subtitle="2013 • Movie" backdropUrl="https://img.example.com/b.jpg" logoUrl="https://img.example.com/l.png" onClose={() => {}} load={async () => downloadOptions([stream])} />);
    expect(await screen.findByText("1 source")).toBeInTheDocument();
    expect(screen.getByText("Best quality first, then smallest")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Downloads" })).toBeInTheDocument();
    expect(screen.getByText("2013 • Movie")).toBeInTheDocument();
    expect(screen.getByText("WEB-DL")).toBeInTheDocument();
    expect(screen.getByText("Cached on TorBox")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Movie" })).toHaveAttribute("src", "https://img.example.com/l.png"); // the title's logo over the backdrop
    expect(document.querySelector(".dlpanel__backdrop")).not.toBeNull();
    expect(document.querySelector(".dlpanel__poster")).toBeNull(); // no poster any more
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /sort|filter/i })).toBeNull();
  });

  it("shows the title's name over the banner when there is no logo, and still works with no backdrop", async () => {
    render(<DownloadPanel target={target} title="Movie" subtitle="2013 • Movie" onClose={() => {}} load={async () => []} />);
    expect(screen.getByRole("heading", { name: "Movie" })).toBeInTheDocument();
    expect(document.querySelector(".dlpanel__backdrop")).toBeNull();
    await screen.findByText(/No downloadable files found/);
  });

  it("the back arrow and the X both close it", () => {
    const onClose = vi.fn();
    render(<DownloadPanel target={target} title="Movie" onClose={onClose} load={async () => []} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
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
