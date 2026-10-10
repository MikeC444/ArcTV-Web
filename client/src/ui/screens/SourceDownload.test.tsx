import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Stream } from "../../domain/types";
import { SourceRow } from "./Sources";

const stream: Stream = {
  id: "s1", providerId: "p", providerLabel: "Addon", resolutionTier: "FHD_1080P", qualityBadge: "1080p", releaseTitle: "Movie.2024.1080p.WEB-DL",
  url: "https://cdn.example.com/d/abc/Movie.2024.1080p.mkv", codec: "H.264",
};

describe("the Download button on a source", () => {
  it("shows for developer accounts as a plain download link to the file", () => {
    render(<SourceRow stream={stream} recommended={false} onClick={() => {}} canDownload />);
    const link = screen.getByRole("link", { name: /Download Movie\.2024\.1080p\.WEB-DL/ });
    expect(link).toHaveAttribute("href", "https://cdn.example.com/d/abc/Movie.2024.1080p.mkv");
    expect(link).toHaveAttribute("download", "Movie.2024.1080p.WEB-DL.mkv");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("is not there for everyone else", () => {
    render(<SourceRow stream={stream} recommended={false} onClick={() => {}} />);
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("is not there for a stream that is not a single file", () => {
    render(<SourceRow stream={{ ...stream, url: "https://cdn.example.com/master.m3u8" }} recommended={false} onClick={() => {}} canDownload />);
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });
});
