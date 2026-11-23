import { PasswordFields, passwordOk } from '../components/PasswordFields';
import { Mark } from '../components/ui';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/supabase';

/** Cliente só para conferir login e tipo de conta antes de abrir a sessão de verdade (não guarda nada). */
const probe = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'anon', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'rcn-probe' },
});
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

const BigLogo = () => <img src="/logo-rcn.png" alt="Render como Negócio" style={{ height: 58, width: 'auto', alignSelf: 'flex-start' }} />;

function ErrAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="alert-err" style={{ alignItems: 'center' }}>
      <div className="ico-circle ico-err"><Mark m="!" size={12} /></div>
      <div style={{ fontSize: 15, color: 'var(--err-t)', fontWeight: 600 }}>{children}</div>
    </div>
  );
}

/** Lado visual das telas de entrada (computador). */
function AuthSplit({ team, children }: { team?: boolean; children: React.ReactNode }) {
  return (
    <div className={'auth' + (team ? ' auth-team' : ' auth-student')}>
      <aside className="auth-side" aria-hidden>
        <img src={team ? '/logo-rcn-branco.png' : '/logo-rcn.png'} alt="" className="auth-side-logo" />
        {team ? (
          <div className="auth-side-body">
            <div className="auth-kicker">Área da equipe</div>
            <div className="auth-title">Acompanhe cada aluno de perto.</div>
            <ul className="auth-list">
              <li><b>Fila</b> de documentos esperando devolutiva</li>
              <li><b>Relatórios</b> quinzenais e quem está atrasado</li>
              <li><b>Botão Vermelho</b>, tarefas e progresso por nível</li>
            </ul>
          </div>
        ) : (
          <div className="auth-side-body">
            <div className="auth-kicker">Portal do aluno</div>
            <div className="auth-title">Seu studio,<br />tratado como negócio.</div>
            <div className="auth-mock">
              <div className="label" style={{ color: 'var(--gold)' }}>Nível 2 de 6</div>
              <div style={{ fontWeight: 600, fontSize: 20, marginTop: 4 }}>Criador</div>
              <div className="track" style={{ marginTop: 12 }}><i style={{ width: '62%' }} /></div>
              <div className="auth-mock-row"><span className="mono">730/1170 XP</span><span>Próximo: <b>Elite</b></span></div>
            </div>
            <div className="auth-foot">Documentos com devolutiva · Relatórios · Gamificação · Sessões</div>
          </div>
        )}
      </aside>
      <main className="auth-main">
        <div className="auth-form">{children}</div>
      </main>
    </div>
  );
}

/** Escolha bem visível entre as duas entradas, no topo das telas. */
function RoleSwitch({ team }: { team?: boolean }) {
  return (
    <nav className={'role-switch' + (team ? ' team' : '')} aria-label="Tipo de acesso">
      <Link to="/login" className={!team ? 'on' : ''} aria-current={!team ? 'page' : undefined}>
        <span className="rs-ico" aria-hidden>🎓</span>
        <span><b>Sou aluno</b><small>Mentorado RCN</small></span>
      </Link>
      <Link to="/equipe/entrar" className={team ? 'on' : ''} aria-current={team ? 'page' : undefined}>
        <span className="rs-ico" aria-hidden>🔒</span>
        <span><b>Sou da equipe</b><small>Acesso restrito</small></span>
      </Link>
    </nav>
  );
}

function useSignIn(team: boolean) {
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<React.ReactNode | null>(null);
  const [passErr, setPassErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setErr('Digite seu e-mail.');
    if (!pass.trim()) {
      setPassErr(true);
      return setErr('Digite sua senha para entrar.');
    }
    setBusy(true);
    const { data, error } = await probe.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (error || !data.session) {
      setBusy(false);
      setPassErr(true);
      return setErr(error?.message.includes('Email not confirmed') ? 'Confirme seu e-mail pelo link que enviamos.' : 'E-mail ou senha não conferem.');
    }
    const { data: prof } = await probe.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    const isStaff = prof?.role === 'staff';
    if (team && !isStaff) {
      // Conta de aluno na área da equipe: não abre sessão por aqui.
      await probe.auth.signOut({ scope: 'local' });
      setBusy(false);
      return setErr(<>Esta é uma conta de aluno. <Link to="/login" className="link">Entre pelo Portal do Aluno</Link>.</>);
    }
    await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    setBusy(false);
    if (!team && isStaff) toast('Conta da equipe: abrimos o painel da equipe.');
    nav(isStaff ? '/equipe' : '/', { replace: true });
  };
  const forgot = async () => {
    if (!email.trim()) return setErr('Digite seu e-mail para receber o link.');
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/nova-senha' });
    toast('Enviamos um link para ' + email.trim() + '.');
  };
  const fields = (
    <>
      <label className="field">
        <span>E-mail</span>
        <input className="input" type="email" autoComplete="email" placeholder={team ? 'voce@rendercomonegocio.com.br' : 'voce@seustudio.com.br'} value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} />
      </label>
      <label className="field">
        <span>Senha</span>
        <input
          className={'input' + (passErr ? ' bad' : '')}
          type="password"
          autoComplete="current-password"
          placeholder="Sua senha"
          value={pass}
          onChange={(e) => { setPass(e.target.value); setPassErr(false); setErr(null); }}
        />
      </label>
    </>
  );
  return { submit, forgot, fields, err, busy };
}

export function Login() {
  const f = useSignIn(false);
  return (
    <AuthSplit>
      <img src="/logo-rcn.png" alt="Render como Negócio" className="auth-mobile-logo" />
      <RoleSwitch />
      <div>
        <div className="auth-chip">Portal do aluno</div>
        <h1 className="auth-h1">Bem-vindo de volta</h1>
        <div className="auth-sub">Entre para ver seus documentos, devolutivas e seu progresso na mentoria.</div>
      </div>
      {f.err && <ErrAlert>{f.err}</ErrAlert>}
      <form onSubmit={f.submit} className="auth-fields">
        {f.fields}
        <button className="btn btn-primary btn-lg" disabled={f.busy}>{f.busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <button onClick={f.forgot} className="auth-forgot">Esqueci minha senha</button>
      <div className="auth-first">
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Primeiro acesso?</div>
          <div style={{ fontSize: 14, color: 'var(--t3)' }}>Use o código da turma que a equipe enviou.</div>
        </div>
        <Link to="/primeiro-acesso" className="btn btn-secondary btn-md">Criar meu acesso</Link>
      </div>
    </AuthSplit>
  );
}

export function StaffLogin() {
  const f = useSignIn(true);
  return (
    <AuthSplit team>
      <img src="/logo-rcn-branco.png" alt="Render como Negócio" className="auth-mobile-logo" />
      <RoleSwitch team />
      <div>
        <div className="auth-chip team"><span className="auth-lock">🔒</span> Acesso restrito · Equipe RCN</div>
        <h1 className="auth-h1">Área da equipe</h1>
        <div className="auth-sub">Painel de acompanhamento dos alunos, fila de devolutivas e relatórios.</div>
      </div>
      {f.err && <ErrAlert>{f.err}</ErrAlert>}
      <form onSubmit={f.submit} className="auth-fields">
        {f.fields}
        <button className="btn btn-gold btn-lg" disabled={f.busy}>{f.busy ? 'Entrando…' : 'Entrar no painel'}</button>
      </form>
      <button onClick={f.forgot} className="auth-forgot">Esqueci minha senha</button>
      <div className="auth-note">Não tem acesso? Os acessos da equipe são liberados pela coordenação da RCN.</div>
    </AuthSplit>
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
  const [confirm, setConfirm] = useState('');
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

  const ok = !!(group && name.trim() && email.trim() && passwordOk(pass, confirm));

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
    <AuthSplit>
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
      <PasswordFields pass={pass} setPass={setPass} confirm={confirm} setConfirm={setConfirm} label="Senha" />
      <button className="btn btn-primary btn-lg" disabled={!ok || busy} onClick={create}>
        {busy ? 'Criando…' : 'Criar acesso'}
      </button>
    </AuthSplit>
  );
}

export function NewPassword() {
  const nav = useNavigate();
  const toast = useToast();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
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
      <PasswordFields pass={pass} setPass={setPass} confirm={confirm} setConfirm={setConfirm} />
      <button className="btn btn-primary btn-lg" disabled={!passwordOk(pass, confirm)} onClick={save}>
        Salvar senha
      </button>
    </AuthShell>
  );
}
