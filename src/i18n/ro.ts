import { project } from "@/config/project";

export const ro = {
  metadata: {
    title: `${project.brand} — Tipare de cusut`,
    description:
      "O viitoare colecție de tipare de cusut, schițată pentru proiectele tale de croitorie.",
  },
  navigation: {
    skip: "Sari la conținut",
    label: "Navigare principală",
    featured: "Tipare",
    categories: "Categorii",
    process: "Cum funcționează",
  },
  home: {
    eyebrow: "Atelier de croitorie",
    title: "Din tipar,",
    titleAccent: "în garderobă.",
    intro:
      "Tipare de cusut pentru piese pe care vei vrea să le porți iar și iar.",
    action: "Vezi colecția demonstrativă",
    imageAlt: "Cămașă din in natural, cu dungi fine și manșete croite",
    imageCaption: "Imagine editorială generată",
    featuredTitle: "Piese de la care poți porni",
    featuredDescription:
      "O previzualizare a colecției. Tiparele vor fi disponibile într-o etapă ulterioară.",
    patterns: [
      {
        name: "Cămașă lejeră",
        detail: "Croială dreaptă, manșete ample",
        shape: "shirt",
      },
      {
        name: "Fustă petrecută",
        detail: "Talie reglabilă, linie în A",
        shape: "skirt",
      },
      {
        name: "Vestă scurtă",
        detail: "Decolteu în V, închidere frontală",
        shape: "vest",
      },
    ],
    categoriesTitle: "Categorii în pregătire",
    categories: ["Bluze și cămăși", "Fuste și rochii", "Veste și jachete"],
    processTitle: "Cum va funcționa",
    benefits: {
      title: "Mai mult control asupra croielii",
      detail:
        "Notează-ți măsurătorile înainte să alegi mărimea și păstrează-le la îndemână. Dacă sunt între două mărimi, verifică unde are nevoie piesa de mai multă lejeritate.",
    },
    steps: [
      {
        title: "Alegi o piesă",
        detail:
          "Vezi croiala, nivelul de dificultate și materialele recomandate.",
      },
      {
        title: "Verifici mărimea",
        detail:
          "Compari măsurătorile tale cu intervalele disponibile pentru tipar.",
      },
      {
        title: "Pregătești materialul",
        detail:
          "Descarci tiparul și urmezi instrucțiunile pentru imprimare și coasere.",
      },
    ],
  },
  footer: {
    description: "Tipare de cusut și inspirație pentru garderoba ta.",
    backToTop: "Înapoi sus",
  },
  admin: { label: "Administrare" },
  errors: {
    notFoundTitle: "Pagina nu a fost găsită",
    notFoundDescription:
      "Adresa poate fi greșită sau pagina poate fi indisponibilă.",
    errorTitle: "A apărut o problemă",
    errorDescription: "Poți reîncerca sau reveni la pagina principală.",
    retry: "Încearcă din nou",
    home: "Pagina principală",
  },
};
