"use client";

import { useActionState } from "react";
import { saveClientLogoAction } from "./client-actions";

export default function ClientLogoForm({ hasLogo }: { hasLogo: boolean }) {
  const [state, action, pending] = useActionState(saveClientLogoAction, {});
  return (
    <form action={action} className="pgr-form">
      <label className="form-field">
        Logo da empresa para documentos
        <input type="file" name="logo" accept="image/png,image/jpeg" required />
        <small>PNG ou JPEG, até 512 KB.</small>
      </label>
      <div className="pcmso-buttons">
        <button type="submit" className="secondary-button" disabled={pending}>
          {pending ? "Salvando…" : hasLogo ? "Trocar logo" : "Salvar logo"}
        </button>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  );
}
