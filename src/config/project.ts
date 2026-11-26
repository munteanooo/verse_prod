export const project = {
  name: "verse_prod",
  repository: "verse_prod",
  brand: "VERSE",
  packageName: "verse-prod",
  databaseName: "verse_prod",
  routes: {
    customer: "/",
    admin: "/admin",
    api: "/api/v1",
  },
  sections: {
    featured: "tipare",
    categories: "categorii",
    process: "cum-functioneaza",
  },
} as const;
