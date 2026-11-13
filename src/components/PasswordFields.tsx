import { Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export const MIN_PASSWORD = 8;

/** Senha válida = mínimo de 8 caracteres e confirmação igual. */
export const passwordOk = (pass: string, confirm: string) => pass.length >= MIN_PASSWORD && pass === confirm;

/** Dois campos (senha e confirmação), com aviso quando não batem e botão de mostrar a senha. */
export function PasswordFields({
  pass,
  setPass,
  confirm,
  setConfirm,
  label = 'Nova senha',
  size,
}: {
  pass: string;
  setPass: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  label?: string;
  size?: 'md';
}) {
  const [show, setShow] = useState(false);
  const cls = 'input' + (size ? ' ' + size : '');
  const short = pass.length > 0 && pass.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== pass;
  const match = confirm.length > 0 && confirm === pass && pass.length >= MIN_PASSWORD;

  return (
    <>
      <label className="field">
        <span>{label}</span>
        <div style={{ position: 'relative' }}>
          <input
            className={cls + (short ? ' bad' : '')}
            style={{ paddingRight: 48 }}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={`Mínimo de ${MIN_PASSWORD} caracteres`}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, display: 'grid', placeItems: 'center', color: 'var(--t3)' }}
          >
            {show ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
        </div>
        {short && <div className="err-text">Use pelo menos {MIN_PASSWORD} caracteres ({pass.length}/{MIN_PASSWORD}).</div>}
      </label>
      <label className="field">
        <span>Confirmar {label.toLowerCase()}</span>
        <input
          className={cls + (mismatch ? ' bad' : '')}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Digite a mesma senha"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && <div className="err-text">As senhas não são iguais.</div>}
        {match && (
          <div className="ok-text" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={14} aria-hidden /> As senhas conferem.
          </div>
        )}
      </label>
    </>
  );
}
