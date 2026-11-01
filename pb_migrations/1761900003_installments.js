/// <reference path="../pb_data/types.d.ts" />
// Krediti i rate: stalni trošak može da važi ograničen broj meseci.
// installments = broj rata (0 ili prazno = važi stalno), start_month = mesec prve rate (YYYY-MM).

migrate((app) => {
  const col = app.findCollectionByNameOrId("fixed_costs");
  col.fields.add(new NumberField({ name: "installments", min: 0, max: 600, onlyInt: true }));
  col.fields.add(new TextField({ name: "start_month", pattern: "^(\\d{4}-\\d{2})?$" }));
  app.save(col);
}, (app) => {
  const col = app.findCollectionByNameOrId("fixed_costs");
  col.fields.removeByName("installments");
  col.fields.removeByName("start_month");
  app.save(col);
});
