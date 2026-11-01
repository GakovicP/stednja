/// <reference path="../pb_data/types.d.ts" />
// Izbor boje aplikacije po nalogu: "zelena" (podrazumevano) ili "roze".
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new SelectField({ name: "palette", values: ["zelena", "roze"], maxSelect: 1 }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("palette");
  app.save(users);
});
