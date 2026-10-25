// The first-run tour would cover the interface in every test: count it as seen. Its own tests clear this.
try {
  localStorage.setItem('exomyth:tour', 'done');
} catch {
  /* No storage: the tour then starts, and tests that care say so. */
}
