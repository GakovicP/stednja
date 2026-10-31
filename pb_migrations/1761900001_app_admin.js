/// <reference path="../pb_data/types.d.ts" />
// Administrator aplikacije: korisnik sa is_admin može da pravi i briše naloge iz same aplikacije.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new BoolField({ name: "is_admin" }));

  const self = "id = @request.auth.id";
  const admin = "@request.auth.is_admin = true";
  users.listRule = `${self} || ${admin}`;
  users.viewRule = `${self} || ${admin}`;
  users.createRule = admin;
  // Niko ne može sam sebi da dodeli ulogu administratora
  users.updateRule = `${self} && @request.body.is_admin:isset = false`;
  users.deleteRule = `${admin} && id != @request.auth.id`;
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("is_admin");
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.createRule = null;
  users.updateRule = "id = @request.auth.id";
  users.deleteRule = "id = @request.auth.id";
  app.save(users);
});
