/// <reference path="../pb_data/types.d.ts" />
// Štedna knjižica: početna šema baze.
// Svi prijavljeni korisnici (vas dvoje) vide i menjaju iste podatke.
// Registracija je zatvorena: naloge pravi samo administrator.

const AUTH = "@request.auth.id != ''";
const rules = {
  listRule: AUTH, viewRule: AUTH, createRule: AUTH, updateRule: AUTH, deleteRule: AUTH,
};

migrate((app) => {
  // Zatvori javnu registraciju na kolekciji korisnika
  const users = app.findCollectionByNameOrId("users");
  users.createRule = null;
  app.save(users);

  // Stalni troškovi (važe za sve otvorene mesece)
  app.save(new Collection({
    type: "base",
    name: "fixed_costs",
    ...rules,
    fields: [
      { type: "text", name: "name", required: true, max: 80 },
      { type: "number", name: "amount", required: true, min: 0 },
      { type: "autodate", name: "created", onCreate: true },
    ],
  }));

  // Meseci: plata, dodatni prihodi i zamrznuti stalni troškovi
  app.save(new Collection({
    type: "base",
    name: "months",
    ...rules,
    fields: [
      { type: "text", name: "key", required: true, pattern: "^\\d{4}-\\d{2}$" },
      { type: "number", name: "salary", min: 0 },
      { type: "json", name: "extra", maxSize: 20000 },
      { type: "json", name: "fixed_snap", maxSize: 20000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_months_key ON months (`key`)"],
  }));

  // Ostali troškovi
  app.save(new Collection({
    type: "base",
    name: "expenses",
    ...rules,
    fields: [
      { type: "text", name: "month", required: true, pattern: "^\\d{4}-\\d{2}$" },
      { type: "date", name: "date", required: true },
      { type: "number", name: "amount", required: true, min: 0 },
      { type: "text", name: "cat", required: true, max: 40 },
      { type: "text", name: "note", max: 200 },
      { type: "text", name: "by", max: 80 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_expenses_month ON expenses (month)"],
  }));
}, (app) => {
  for (const name of ["expenses", "months", "fixed_costs"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users");
  users.createRule = "";
  app.save(users);
});
