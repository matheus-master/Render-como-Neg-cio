import { Mark } from '../components/ui';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { useIsMobile } from '../lib/useIsMobile';

function AuthShell({ children }: { children: React.ReactNode }) {
  const mobile = useIsMobile();
  return (
    <div style={{ padding: mobile ? '36px 20px' : '64px 24px', minHeight: '100%' }}>
      <div style={{ maxWidth: 420, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>{children}</div>
    </div>
  );
}

const BigLogo = () => (
  <div style={{ fontWeight: 600, fontSize: 26, lineHeight: 0.95, letterSpacing: '-.02em', color: 'var(--ac)' }}>
    Render<span style={{ fontSize: 14, fontWeight: 600, marginLeft: 3 }}>como</span>
    <br />
    Negócio
  </div>
);

function ErrAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="alert-err" style={{ alignItems: 'center' }}>
      <div className="ico-circle ico-err"><Mark m="!" size={12} /></div>
      <div style={{ fontSize: 15, color: 'var(--err-t)', fontWeight: 600 }}>{children}</div>
    </div>
  );
}

export function Login() {
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [passErr, setPassErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass.trim()) {
      setPassErr(true);
      return setErr('Digite sua senha para entrar.');
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) {
      setPassErr(true);
      return setErr(error.message.includes('Email not confirmed') ? 'Confirme seu e-mail pelo link que enviamos.' : 'E-mail ou senha não conferem.');
    }
    nav('/', { replace: true });
  };

  const forgot = async () => {
    if (!email.trim()) return setErr('Digite seu e-mail para receber o link.');
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/nova-senha' });
    toast('Enviamos um link para ' + email.trim() + '.');
  };

  return (
    <AuthShell>
      <BigLogo />
      <div>
        <h1 style={{ fontWeight: 600, fontSize: 28, lineHeight: 1.15 }}>Bem-vindo de volta</h1>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t3)', marginTop: 6 }}>Entre para ver seus materiais, devolutivas e progresso.</div>
      </div>
      {err && <ErrAlert>{err}</ErrAlert>}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <label className="field">
          <span>E-mail</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            className={'input' + (passErr ? ' bad' : '')}
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              setPassErr(false);
              setErr(null);
            }}
          />
        </label>
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <button onClick={forgot} style={{ fontWeight: 600, fontSize: 15, color: 'var(--ac)', textAlign: 'center', padding: 6, marginTop: -8 }}>
        Esqueci minha senha
      </button>
      <div style={{ borderTop: '1px solid var(--b-card)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
        <div style={{ fontSize: 15, color: 'var(--t2)' }}>Primeiro acesso?</div>
        <Link to="/primeiro-acesso" className="btn btn-secondary btn-md btn-block" style={{ borderRadius: 10 }}>
          Entrar com o código da turma
        </Link>
      </div>
    </AuthShell>
  );
}

export function FirstAccess() {
  const nav = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Valida o código enquanto digita.
  useEffect(() => {
    setGroup(null);
    setCodeErr(false);
    const c = code.trim();
    if (c.length < 6) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('check_class_code', { p_code: c });
      if (data) setGroup(data as string);
      else setCodeErr(true);
    }, 350);
    return () => clearTimeout(t);
  }, [code]);

  const ok = !!(group && name.trim() && email.trim() && pass.length >= 8);

  const create = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { full_name: name.trim(), class_code: code.trim().toUpperCase() }, emailRedirectTo: window.location.origin + '/' },
    });
    setBusy(false);
    if (error) return setErr(/registered/i.test(error.message) ? 'Este e-mail já tem conta. Entre com sua senha.' : 'Não deu para criar o acesso. Confira os dados.');
    if (!data.session) {
      toast('Enviamos um link de confirmação para ' + email.trim() + '.');
      return nav('/login');
    }
    nav('/', { replace: true });
  };

  return (
    <AuthShell>
      <Link to="/login" className="back" style={{ marginBottom: -4 }}>
        <Mark m="←" size={14} /> Já tenho conta
      </Link>
      <div>
        <h1 style={{ fontWeight: 600, fontSize: 28, lineHeight: 1.15 }}>Primeiro acesso</h1>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t3)', marginTop: 6 }}>Use o código que a equipe RCN enviou para você.</div>
      </div>
      {err && <ErrAlert>{err}</ErrAlert>}
      <label className="field">
        <span>Código da turma</span>
        <input
          className={'input' + (codeErr ? ' bad' : '')}
          style={{ letterSpacing: '.08em', fontWeight: 600 }}
          placeholder="ZT-0000"
          value={code}
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        {group && <div className="ok-text"><Mark m="✓" size={13} /> Grupo {group}</div>}
        {codeErr && <div className="err-text">! Código não encontrado. Confira com a equipe RCN.</div>}
      </label>
      <label className="field">
        <span>Nome completo</span>
        <input className="input" placeholder="Como aparece para a equipe" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>E-mail</span>
        <input className="input" type="email" placeholder="voce@seustudio.com.br" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Criar senha</span>
        <input className="input" type="password" placeholder="Mínimo de 8 caracteres" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      <button className="btn btn-primary btn-lg" disabled={!ok || busy} onClick={create}>
        {busy ? 'Criando…' : 'Criar acesso'}
      </button>
    </AuthShell>
  );
}

export function NewPassword() {
  const nav = useNavigate();
  const toast = useToast();
  const [pass, setPass] = useState('');
  const save = async () => {
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) return toast('Link expirado. Peça um novo em "Esqueci minha senha".');
    toast('Senha alterada.');
    nav('/', { replace: true });
  };
  return (
    <AuthShell>
      <BigLogo />
      <h1 style={{ fontWeight: 600, fontSize: 28 }}>Nova senha</h1>
      <label className="field">
        <span>Nova senha</span>
        <input className="input" type="password" placeholder="Mínimo de 8 caracteres" value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      <button className="btn btn-primary btn-lg" disabled={pass.length < 8} onClick={save}>
        Salvar senha
      </button>
    </AuthShell>
  );
}
