// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createDashboardStore } from './dashboardStore';
import { useDashboardKeys } from './useDashboardKeys';

afterEach(cleanup);

function Probe({ store, lightboxOpen, pipelineOpen }: { store: ReturnType<typeof createDashboardStore>; lightboxOpen: boolean; pipelineOpen: boolean }) {
  useDashboardKeys(store, () => undefined, lightboxOpen, pipelineOpen);
  return null;
}

function mount(lightboxOpen = false, pipelineOpen = false) {
  const store = createDashboardStore();
  render(<Probe store={store} lightboxOpen={lightboxOpen} pipelineOpen={pipelineOpen} />);
  return store;
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

  it('ignores keys typed in a field', () => {
    const store = mount();
    const { container } = render(<input />);
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'p' });
    expect(store.get().ui.perceptionOpen).toBe(false);
  });
});
