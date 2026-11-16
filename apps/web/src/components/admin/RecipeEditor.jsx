import { useState } from "react";
import { ErrorNotice, Loading } from "../QueryStatus.jsx";
import { useSaveRecipe } from "../../lib/admin.js";
import { ApiError } from "../../lib/api.js";
import { useRecipe } from "../../lib/booking.js";
import ui from "../../styles/ui.module.css";
import staff from "../StaffPage.module.css";
import admin from "./admin.module.css";
import { Field } from "./fields.jsx";
import FormError from "./FormError.jsx";

const newKey = () => crypto.randomUUID();

/** "Fresh egg noodles" → "fresh-egg-noodles", the ingredient ID guests' ticks use. */
function slug(name) {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "item";
}

/**
 * The shopping list and steps a class teaches (PUT replaces the whole
 * recipe). A class with no recipe yet answers 404, which starts it empty.
 */
export default function RecipeEditor({ classId }) {
  const query = useRecipe(classId);
  const missing = query.error instanceof ApiError && query.error.status === 404;

  if (query.isPending) return <Loading />;
  if (query.isError && !missing) return <ErrorNotice error={query.error} />;
  return <RecipeForm classId={classId} recipe={missing ? null : query.data} />;
}

function RecipeForm({ classId, recipe }) {
  const save = useSaveRecipe(classId);
  const [status, setStatus] = useState("");
  const [ingredients, setIngredients] = useState(() =>
    (recipe?.ingredients.length
      ? recipe.ingredients
      : [{ id: "", name: "", quantity: "" }]
    ).map((i) => ({ ...i, nameThai: i.nameThai ?? "", key: newKey() })),
  );
  const [steps, setSteps] = useState(() =>
    (recipe?.steps.length ? recipe.steps : [{ text: "" }]).map((s) => ({
      text: s.text,
      videoAssetId: s.videoAssetId,
      key: newKey(),
    })),
  );
  const [yaiTip, setYaiTip] = useState(recipe?.yaiTip ?? "");
  const [yaiNote, setYaiNote] = useState(recipe?.yaiNote ?? "");

  const editRow = (setRows, key, field) => (e) =>
    setRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, [field]: e.target.value } : r)),
    );
  const removeRow = (setRows, key) =>
    setRows((rows) => rows.filter((r) => r.key !== key));

  function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    const used = new Set();
    const body = {
      ingredients: ingredients.map((i) => {
        // Keep an existing ID: guests' saved ticks point at it.
        let id = i.id || slug(i.name);
        for (let n = 2; used.has(id); n++) id = `${slug(i.name)}-${n}`;
        used.add(id);
        return {
          id,
          name: i.name.trim(),
          quantity: i.quantity.trim(),
          ...(i.nameThai.trim() && { nameThai: i.nameThai.trim() }),
        };
      }),
      steps: steps.map((s) => ({
        text: s.text.trim(),
        ...(s.videoAssetId && { videoAssetId: s.videoAssetId }),
      })),
      ...(yaiTip.trim() && { yaiTip: yaiTip.trim() }),
      ...(yaiNote.trim() && { yaiNote: yaiNote.trim() }),
    };
    save.mutate(body, {
      onSuccess: () => {
        // Remember the IDs just saved, so renaming one later keeps its ID.
        setIngredients((rows) =>
          rows.map((r, n) => ({ ...r, id: body.ingredients[n].id })),
        );
        setStatus("Recipe saved.");
      },
    });
  }

  return (
    <form className={`${ui.card} ${admin.form}`} onSubmit={handleSubmit}>
      <section className={staff.section}>
        <h3 className={ui.h3}>Shopping list</h3>
        <div className={admin.stack}>
          {ingredients.map((i, n) => (
            <div key={i.key} className={admin.editRow}>
              <Field
                label={`Ingredient ${n + 1}`}
                required
                maxLength={80}
                value={i.name}
                onChange={editRow(setIngredients, i.key, "name")}
              />
              <Field
                label="In Thai"
                maxLength={80}
                lang="th"
                value={i.nameThai}
                onChange={editRow(setIngredients, i.key, "nameThai")}
              />
              <Field
                label="Amount"
                required
                maxLength={40}
                placeholder="200 g"
                value={i.quantity}
                onChange={editRow(setIngredients, i.key, "quantity")}
              />
              <button
                type="button"
                className={ui.outline}
                onClick={() => removeRow(setIngredients, i.key)}
                disabled={ingredients.length === 1}
                aria-label={`Remove ingredient ${n + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div>
          <button
            type="button"
            className={ui.outline}
            onClick={() =>
              setIngredients((rows) => [
                ...rows,
                { id: "", name: "", nameThai: "", quantity: "", key: newKey() },
              ])
            }
            disabled={ingredients.length >= 50}
          >
            Add an ingredient
          </button>
        </div>
      </section>

      <section className={staff.section}>
        <h3 className={ui.h3}>Steps</h3>
        <ol className={`${admin.stack} ${admin.plainList}`}>
          {steps.map((s, n) => (
            <li key={s.key} className={admin.stepRow}>
              <span className={admin.stepNumber} aria-hidden="true">
                {n + 1}
              </span>
              <Field
                label={`Step ${n + 1}`}
                as="textarea"
                rows={2}
                required
                maxLength={1000}
                value={s.text}
                onChange={editRow(setSteps, s.key, "text")}
              />
              <button
                type="button"
                className={ui.outline}
                onClick={() => removeRow(setSteps, s.key)}
                disabled={steps.length === 1}
                aria-label={`Remove step ${n + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <div>
          <button
            type="button"
            className={ui.outline}
            onClick={() =>
              setSteps((rows) => [...rows, { text: "", key: newKey() }])
            }
            disabled={steps.length >= 50}
          >
            Add a step
          </button>
        </div>
      </section>

      <div className={admin.fields}>
        <Field
          label="Yai's tip (on the shopping list)"
          as="textarea"
          rows={2}
          maxLength={500}
          value={yaiTip}
          onChange={(e) => setYaiTip(e.target.value)}
        />
        <Field
          label="Yai's note (on the recipe card)"
          as="textarea"
          rows={2}
          maxLength={1000}
          value={yaiNote}
          onChange={(e) => setYaiNote(e.target.value)}
        />
      </div>

      <div className={admin.actions}>
        <button type="submit" className={ui.primary} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save recipe"}
        </button>
        <p className={ui.body} role="status">
          {status}
        </p>
      </div>
      <FormError error={save.error} />
    </form>
  );
}
