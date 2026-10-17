import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CatalogProvider } from "../../domain/provider";
import { useProviders } from "../../domain/registry";
import { serviceRowId } from "../../domain/streamingServices";
import { useSettings } from "../../state/settings";
import { StreamingTiles } from "./StreamingTiles";

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const provider = (services: string[]): CatalogProvider => ({ id: "p", name: "P", streamingServices: () => services }) as unknown as CatalogProvider;
const show = () =>
  render(
    <MemoryRouter>
      <StreamingTiles />
    </MemoryRouter>,
  );

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: typeof FakeObserver }).ResizeObserver = FakeObserver;
  useProviders.setState({ providers: [] });
  useSettings.setState({ homeRows: { order: [], hiddenRowIds: [] } });
});
afterEach(cleanup);

describe("StreamingTiles", () => {
  it("shows nothing while no addon has a streaming service", () => {
    useProviders.setState({ providers: [provider([])] });
    show();
    expect(screen.queryByText("Streaming services")).toBeNull();
  });

  it("shows a tile for each service an addon has, in tile order, each leading to its page", () => {
    useProviders.setState({ providers: [provider(["hulu", "netflix"])] });
    show();
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/streaming/netflix", "/streaming/hulu"]);
    expect(screen.getByLabelText("Netflix titles")).toBeTruthy();
  });

  it("leaves out a service the person turned off in Home Rows, and the whole row when none are left", () => {
    useProviders.setState({ providers: [provider(["netflix", "disney"])] });
    useSettings.setState({ homeRows: { order: [], hiddenRowIds: [serviceRowId("disney")] } });
    show();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    cleanup();
    act(() => useSettings.setState({ homeRows: { order: [], hiddenRowIds: [serviceRowId("disney"), serviceRowId("netflix")] } }));
    show();
    expect(screen.queryByText("Streaming services")).toBeNull();
  });
});
