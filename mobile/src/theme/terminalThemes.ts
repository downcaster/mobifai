export interface TerminalTheme {
  id: string;
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent?: string;
}

export const terminalThemes: TerminalTheme[] = [
  {
    id: "default",
    name: "Classic",
    background: "#000000",
    foreground: "#00ff00",
    cursor: "#00ff00",
    cursorAccent: "#000000",
  },
  {
    id: "light",
    name: "Light",
    background: "#ffffff",
    foreground: "#000000",
    cursor: "#000000",
    cursorAccent: "#ffffff",
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    background: "#000000",
    foreground: "#ffffff",
    cursor: "#ffffff",
    cursorAccent: "#000000",
  },
  {
    id: "oceanic",
    name: "Oceanic",
    background: "#1e2436",
    foreground: "#89ddff",
    cursor: "#89ddff",
    cursorAccent: "#1e2436",
  },
  {
    id: "monokai",
    name: "Monokai",
    background: "#272822",
    foreground: "#fd971f",
    cursor: "#fd971f",
    cursorAccent: "#272822",
  },
  {
    id: "dracula",
    name: "Dracula",
    background: "#282a36",
    foreground: "#bd93f9",
    cursor: "#bd93f9",
    cursorAccent: "#282a36",
  },
  {
    id: "solarized",
    name: "Solarized",
    background: "#002b36",
    foreground: "#2aa198",
    cursor: "#2aa198",
    cursorAccent: "#002b36",
  },
  {
    id: "nord",
    name: "Nord",
    background: "#2e3440",
    foreground: "#88c0d0",
    cursor: "#88c0d0",
    cursorAccent: "#2e3440",
  },
];

export const getThemeById = (id: string): TerminalTheme => {
  return terminalThemes.find((theme) => theme.id === id) || terminalThemes[0];
};

export const defaultTheme = terminalThemes[0];

