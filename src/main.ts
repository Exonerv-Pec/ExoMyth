import { mount } from 'svelte';
import './styles.css';
import App from './App.svelte';
import { migrateBrowserData } from './migrate';

// Carry over data saved under the project's earlier name before anything reads it.
void migrateBrowserData().finally(() => {
  mount(App, { target: document.getElementById('app')! });
});
