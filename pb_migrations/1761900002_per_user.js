/// <reference path="../pb_data/types.d.ts" />
// Svaki nalog ima svoju, odvojenu knjižicu.
// Postojeći podaci prelaze na najstarijeg administratora aplikacije (ili najstarijeg korisnika).

const NAMES = ["fixed_costs", "months", "expenses"];
const OWN = "owner = @request.auth.id";
const CREATE = "@request.auth.id != '' && @request.body.owner = @request.auth.id";
const UPDATE = "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // Kome pripadaju podaci uneti pre ove izmene
  let heir = null;
  try { heir = app.findRecordsByFilter("users", "is_admin = true", "created", 1, 0)[0] || null; } catch (_) {}
  if (!heir) { try { heir = app.findRecordsByFilter("users", "id != ''", "created", 1, 0)[0] || null; } catch (_) {} }

  for (const name of NAMES) {
    const col = app.findCollectionByNameOrId(name);
    col.fields.add(new RelationField({
      name: "owner", collectionId: users.id, maxSelect: 1, cascadeDelete: true, required: false,
    }));
    if (name === "months") {
      col.indexes = ["CREATE UNIQUE INDEX idx_months_owner_key ON months (owner, `key`)"];
    }
    app.save(col);

    for (const rec of app.findAllRecords(name)) {
      if (heir) { rec.set("owner", heir.id); app.save(rec); }
      else app.delete(rec);
    }

    const col2 = app.findCollectionByNameOrId(name);
    col2.fields.getByName("owner").required = true;
    col2.listRule = OWN;
    col2.viewRule = OWN;
    col2.createRule = CREATE;
    col2.updateRule = UPDATE;
    col2.deleteRule = OWN;
    app.save(col2);
  }
}, (app) => {
  const AUTH = "@request.auth.id != ''";
  for (const name of NAMES) {
    const col = app.findCollectionByNameOrId(name);
    col.fields.removeByName("owner");
    if (name === "months") col.indexes = ["CREATE UNIQUE INDEX idx_months_key ON months (`key`)"];
    col.listRule = col.viewRule = col.createRule = col.updateRule = col.deleteRule = AUTH;
    app.save(col);
  }
});
