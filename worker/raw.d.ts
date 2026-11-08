// Vite's ?raw imports: the file's contents as a string (used for the /stats page).
declare module "*?raw" {
  const content: string;
  export default content;
}
