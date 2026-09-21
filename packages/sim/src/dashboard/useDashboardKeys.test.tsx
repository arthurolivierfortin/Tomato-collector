// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createDashboardStore } from './dashboardStore';
import { useDashboardKeys } from './useDashboardKeys';

afterEach(cleanup);

interface ProbeProps {
  store: ReturnType<typeof createDashboardStore>;
  lightboxOpen: boolean;
  pipelineOpen: boolean;
  toggleFraming: () => void;
  toggleToolCamera: () => void;
}

function Probe({ store, lightboxOpen, pipelineOpen, toggleFraming, toggleToolCamera }: ProbeProps) {
  useDashboardKeys(store, () => undefined, lightboxOpen, pipelineOpen, toggleFraming, toggleToolCamera);
  return null;
}

function mount(lightboxOpen = false, pipelineOpen = false) {
  const store = createDashboardStore();
  const framings: number[] = [];
  const toolCameras: number[] = [];
  render(
    <Probe
      store={store}
      lightboxOpen={lightboxOpen}
      pipelineOpen={pipelineOpen}
      toggleFraming={() => framings.push(1)}
      toggleToolCamera={() => toolCameras.push(1)}
    />,
  );
  return Object.assign(store, { framings, toolCameras });
}

describe('useDashboardKeys', () => {
  it('toggles the perception panel on p and the pipeline on x', () => {
    const store = mount();
    fireEvent.keyDown(window, { key: 'p' });
    expect(store.get().ui.perceptionOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'x' });
    expect(store.get().ui.pipelineCamera).toBe('front');
  });

  // Revue visuelle de PR #38 : la loupe et le pipeline sont au même niveau ; x ferme la loupe d'abord.
  it('closes the lightbox before opening the pipeline', () => {
    const store = mount(true);
    store.dispatch({ type: 'local_lightbox_open', camera: 'top' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(store.get().ui.lightbox).toBeNull();
    expect(store.get().ui.pipelineCamera).toBe('top');
  });

  it('closes the pipeline on a second x', () => {
    const store = mount(false, true);
    store.dispatch({ type: 'local_pipeline_open', camera: 'front' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(store.get().ui.pipelineCamera).toBeNull();
  });

  // Issue #42 : `k` bascule le cadrage spectateur large ↔ coupe.
  it('toggles the spectator framing on k', () => {
    const store = mount();
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'k' });
    expect(store.framings).toHaveLength(2);
  });

  // Issue #42 : `j` force l'incrustation de la caméra outil, dans un sens puis dans l'autre.
  it('toggles the tool camera inset on j', () => {
    const store = mount();
    fireEvent.keyDown(window, { key: 'j' });
    expect(store.toolCameras).toHaveLength(1);
  });

  it('ignores keys typed in a field', () => {
    const store = mount();
    const { container } = render(<input />);
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'p' });
    expect(store.get().ui.perceptionOpen).toBe(false);
  });
});
