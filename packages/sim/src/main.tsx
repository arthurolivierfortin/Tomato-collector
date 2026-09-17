import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Pas de <StrictMode> : la scène WebGL, le runtime WASM de Rapier et les modules à état (robot, cameras)
// sont des singletons ; le double montage de développement en créerait deux et le second écraserait le premier.
createRoot(document.getElementById('root')!).render(<App />);
