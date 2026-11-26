/**
 * Criador de avatar em personagem: cada pessoa monta o seu (pele, cabelo, barba, rosto, óculos, roupa, fundo).
 * Desenhos: Avataaars, de Pablo Stanley (uso pessoal e comercial liberado), pela biblioteca DiceBear.
 * Ao salvar, o personagem vira uma imagem (PNG) no lugar da foto: aparece em todo o portal sem mudar nada.
 */
import { createAvatar } from '@dicebear/core';
import * as avataaars from '@dicebear/avataaars';
import { useQueryClient } from '@tanstack/react-query';
import { Dices, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth, useProfile } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

export type AvatarSex = 'm' | 'f';
export interface AvatarConfig {
  sex: AvatarSex; skin: string; top: string; hair: string; facialHair: string; facialHairColor: string;
  eyes: string; eyebrows: string; mouth: string; accessories: string; clothing: string; clothes: string; bg: string;
}

const SKIN = ['ffdbb4', 'edb98a', 'd08b5b', 'ae5d29', '614335', 'fd9841', 'f8d25c'];
const HAIR = ['2c1b18', '4a312c', '724133', 'a55728', 'b58143', 'd6b370', 'ecdcbf', 'e8e1e1', 'c93305', 'f59797'];
// Estilos separados por personagem (masculino/feminino); chapéus, turbante, black e dreads aparecem nos dois.
const HATS = ['turban', 'hat', 'winterHat1', 'winterHat02', 'winterHat03', 'winterHat04'];
const TOPS_M = ['shortFlat', 'shortRound', 'shortWaved', 'shortCurly', 'theCaesar', 'theCaesarAndSidePart', 'sides', 'shavedSides', 'shaggy', 'shaggyMullet', 'frizzle', 'fro', 'dreads01', 'dreads02', 'dreads', ...HATS];
const TOPS_F = ['longButNotTooLong', 'straight01', 'straight02', 'straightAndStrand', 'bob', 'miaWallace', 'bigHair', 'curly', 'curvy', 'bun', 'frida', 'fro', 'froBand', 'dreads', 'shaggy', 'hijab', ...HATS];
const TOPS: Record<AvatarSex, string[]> = { m: TOPS_M, f: TOPS_F };
const ONLY_F = new Set(TOPS_F.filter((t) => !TOPS_M.includes(t)));
const COVERS = new Set(['hijab', 'turban', 'hat', 'winterHat1', 'winterHat02', 'winterHat03', 'winterHat04']);
const EYES = ['default', 'happy', 'wink', 'squint', 'side', 'surprised', 'closed', 'eyeRoll', 'hearts', 'winkWacky', 'cry', 'xDizzy'];
const BROWS = ['defaultNatural', 'default', 'flatNatural', 'raisedExcitedNatural', 'raisedExcited', 'upDownNatural', 'upDown', 'frownNatural', 'sadConcernedNatural', 'sadConcerned', 'angryNatural', 'angry', 'unibrowNatural'];
const MOUTHS = ['smile', 'default', 'twinkle', 'serious', 'tongue', 'eating', 'concerned', 'disbelief', 'grimace', 'sad', 'screamOpen', 'vomit'];
const BEARDS = ['', 'beardLight', 'beardMedium', 'beardMajestic', 'moustacheFancy', 'moustacheMagnum'];
const GLASSES = ['', 'prescription01', 'prescription02', 'round', 'kurt', 'wayfarers', 'sunglasses', 'eyepatch'];
const CLOTHING = ['blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'shirtVNeck', 'shirtCrewNeck', 'shirtScoopNeck', 'hoodie', 'overall', 'graphicShirt'];
// Cores da RCN primeiro (marinho, âmbar, azul-aço, menta), depois as da biblioteca.
const CLOTHES = ['1f3a5e', 'e3a440', '5e85aa', '2f5b56', '262e33', '3c4f5c', '929598', 'e6e6e6', 'ffffff', 'b1e2ff', '65c9ff', 'a7ffc4', 'ffafb9', 'ff5c5c', 'ff488e', 'ffffb1'];
const BG = ['e6f0f6', 'cbeae0', 'fbf0dc', 'f4f2ee', '1f3a5e', '0c1b2f', 'e3a440', '5e85aa', 'ffafb9', 'b1e2ff'];

export const DEFAULT_AVATAR: AvatarConfig = {
  sex: 'm', skin: 'edb98a', top: 'shortFlat', hair: '2c1b18', facialHair: '', facialHairColor: '2c1b18', eyes: 'default', eyebrows: 'defaultNatural',
  mouth: 'smile', accessories: '', clothing: 'blazerAndShirt', clothes: '1f3a5e', bg: 'e6f0f6',
};
const START: Record<AvatarSex, AvatarConfig> = {
  m: DEFAULT_AVATAR,
  f: { ...DEFAULT_AVATAR, sex: 'f', top: 'longButNotTooLong', hair: '4a312c', clothing: 'blazerAndSweater', clothes: '1f3a5e', bg: 'cbeae0' },
};

/** Avatar salvo antes da separação: deduz o personagem pelo cabelo. */
function fromSaved(saved: Partial<AvatarConfig> | null | undefined): AvatarConfig {
  const c = { ...DEFAULT_AVATAR, ...(saved ?? {}) };
  if (!saved?.sex) c.sex = ONLY_F.has(c.top) ? 'f' : 'm';
  return c;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
function randomAvatar(sex: AvatarSex): AvatarConfig {
  return {
    sex, skin: pick(SKIN.slice(0, 5)), top: pick(TOPS[sex]), hair: pick(HAIR), facialHair: sex === 'm' && Math.random() < 0.3 ? pick(BEARDS.slice(1)) : '', facialHairColor: pick(HAIR.slice(0, 6)),
    eyes: pick(EYES.slice(0, 6)), eyebrows: pick(BROWS.slice(0, 6)), mouth: pick(MOUTHS.slice(0, 5)), accessories: Math.random() < 0.3 ? pick(GLASSES.slice(1, 6)) : '',
    clothing: pick(CLOTHING), clothes: pick(CLOTHES.slice(0, 10)), bg: pick(BG.slice(0, 4)),
  };
}

/** Desenho do personagem (SVG) a partir das escolhas. */
export function avatarSvg(c: AvatarConfig): string {
  return createAvatar(avataaars, {
    seed: 'rcn',
    skinColor: [c.skin],
    top: [c.top as never], topProbability: 100, hairColor: [c.hair], hatColor: [c.clothes],
    facialHair: c.facialHair ? [c.facialHair as never] : undefined, facialHairProbability: c.facialHair ? 100 : 0, facialHairColor: [c.facialHairColor || c.hair],
    eyes: [c.eyes as never], eyebrows: [c.eyebrows as never], mouth: [c.mouth as never],
    accessories: c.accessories ? [c.accessories as never] : undefined, accessoriesProbability: c.accessories ? 100 : 0, accessoriesColor: ['262e33'],
    clothing: [c.clothing as never], clothesColor: [c.clothes], clothingGraphic: ['diamond'],
    backgroundColor: [c.bg],
  }).toString();
}
const dataUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

/** PNG quadrado para guardar como foto. */
async function toPng(svg: string, size = 512): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.drawImage(img, 0, 0, size, size);
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('png'))), 'image/png'));
}

type Tab = 'cabelo' | 'rosto' | 'barba' | 'roupa' | 'fundo';
const tabs = (sex: AvatarSex): [Tab, string][] => [['cabelo', 'Cabelo'], ['rosto', 'Pele e rosto'], ['barba', sex === 'm' ? 'Barba e óculos' : 'Óculos'], ['roupa', 'Roupa'], ['fundo', 'Fundo']];
const SEX_LABEL: Record<AvatarSex, string> = { m: 'Masculino', f: 'Feminino' };

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="avb-group">
      <div className="avb-label">{label}</div>
      <div className="avb-swatches" role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <button key={c} role="radio" aria-checked={value === c} aria-label={'#' + c} className={'avb-sw' + (value === c ? ' on' : '')} style={{ background: '#' + c }} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  );
}

export default function AvatarBuilder({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const { reloadProfile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const saved = profile.avatar_config as Partial<AvatarConfig> | null;
  const [cfg, setCfg] = useState<AvatarConfig>(() => fromSaved(saved));
  // Primeira vez: começa escolhendo masculino ou feminino.
  const [started, setStarted] = useState(!!saved);
  const [allStyles, setAllStyles] = useState(false);
  const [tab, setTab] = useState<Tab>('cabelo');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AvatarConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const preview = useMemo(() => dataUrl(avatarSvg(cfg)), [cfg]);
  const starts = useMemo(() => ({ m: dataUrl(avatarSvg(START.m)), f: dataUrl(avatarSvg(START.f)) }), []);

  /** Troca de personagem: mantém pele, rosto, roupa e fundo; ajusta o cabelo e tira a barba no feminino. */
  const chooseSex = (sex: AvatarSex) => {
    setAllStyles(false);
    setCfg((c) => (c.sex === sex ? c : { ...c, sex, top: TOPS[sex].includes(c.top) ? c.top : START[sex].top, facialHair: sex === 'f' ? '' : c.facialHair }));
  };
  const begin = (sex: AvatarSex) => {
    setCfg({ ...START[sex] });
    setTab('cabelo');
    setStarted(true);
  };
  const otherSex: AvatarSex = cfg.sex === 'm' ? 'f' : 'm';
  const styleList = allStyles ? [...TOPS[cfg.sex], ...TOPS[otherSex].filter((t) => !TOPS[cfg.sex].includes(t))] : TOPS[cfg.sex];

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const thumbs = (field: keyof AvatarConfig, options: string[], extra?: Partial<AvatarConfig>) =>
    options.map((o) => ({ o, src: dataUrl(avatarSvg({ ...cfg, ...extra, [field]: o })) }));
  const grid = (field: keyof AvatarConfig, options: string[], label: string, names?: Record<string, string>, extra?: Partial<AvatarConfig>) => (
    <div className="avb-group">
      <div className="avb-label">{label}</div>
      <div className="avb-grid" role="radiogroup" aria-label={label}>
        {thumbs(field, options, extra).map(({ o, src }) => (
          <button key={o || 'nenhum'} role="radio" aria-checked={cfg[field] === o} className={'avb-opt' + (cfg[field] === o ? ' on' : '')} onClick={() => set({ [field]: o })} title={names?.[o] ?? undefined}>
            <img src={src} alt="" loading="lazy" />
            {names?.[o] !== undefined && <span>{names[o]}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  const save = async () => {
    setBusy(true);
    try {
      const blob = await toPng(avatarSvg(cfg));
      const path = `${profile.id}/avatar/${Date.now()}_personagem.png`;
      const up = await supabase.storage.from('files').upload(path, blob, { contentType: 'image/png' });
      if (up.error) throw up.error;
      const old = profile.avatar_path;
      const { error } = await supabase.from('profiles').update({ avatar_path: path, avatar_config: cfg }).eq('id', profile.id);
      if (error) throw error;
      if (old && old !== path) await supabase.storage.from('files').remove([old]);
      qc.invalidateQueries({ queryKey: ['staff-overview'] });
      reloadProfile();
      toast('Avatar salvo. Ele já aparece no portal.');
      onClose();
    } catch {
      toast('Não deu para salvar o avatar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const cover = COVERS.has(cfg.top);
  return (
    <div className="modal-backdrop avb-wrap" onClick={onClose}>
      <div className="modal avb" role="dialog" aria-modal="true" aria-label="Criar meu avatar" onClick={(e) => e.stopPropagation()}>
        <div className="avb-head">
          <div>
            <div className="k-eyebrow">Seu personagem</div>
            <h2>Criar meu avatar</h2>
          </div>
          <button className="send-x" aria-label="Fechar" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        <div className={'avb-body' + (started ? '' : ' pick')}>
          {started && (
            <div className="avb-stage">
              <img src={preview} alt="Prévia do seu avatar" className="avb-preview" />
              <button className="btn btn-secondary btn-sm" onClick={() => setCfg(randomAvatar(cfg.sex))}><Dices size={16} aria-hidden /> Sortear</button>
            </div>
          )}
          {!started ? (
          <div className="avb-panel avb-start">
            <div className="avb-label">Para começar, escolha o seu personagem</div>
            <p className="avb-start-sub">Depois você ajusta cabelo, pele, rosto, roupa e fundo. Dá para trocar a qualquer momento.</p>
            <div className="avb-start-grid">
              {(['m', 'f'] as AvatarSex[]).map((s) => (
                <button key={s} className="avb-start-card" onClick={() => begin(s)}>
                  <img src={starts[s]} alt="" />
                  <b>{SEX_LABEL[s]}</b>
                </button>
              ))}
            </div>
          </div>
          ) : (
          <div className="avb-panel">
            <div className="avb-sex" role="radiogroup" aria-label="Personagem">
              {(['m', 'f'] as AvatarSex[]).map((s) => (
                <button key={s} role="radio" aria-checked={cfg.sex === s} className={'avb-sex-btn' + (cfg.sex === s ? ' on' : '')} onClick={() => chooseSex(s)}>{SEX_LABEL[s]}</button>
              ))}
            </div>
            <div className="avb-tabs" role="tablist">
              {tabs(cfg.sex).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={'avb-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div className="avb-scroll">
              {tab === 'cabelo' && (
                <>
                  <Swatches label={cover ? 'Cor do lenço/chapéu: escolha em Roupa' : 'Cor do cabelo'} colors={HAIR} value={cfg.hair} onPick={(c) => set({ hair: c, facialHairColor: c })} />
                  {grid('top', styleList, 'Estilo')}
                  <button className="avb-more" onClick={() => setAllStyles((v) => !v)}>
                    {allStyles ? `Mostrar só os estilos ${cfg.sex === 'm' ? 'masculinos' : 'femininos'}` : `Ver também os estilos ${otherSex === 'm' ? 'masculinos' : 'femininos'}`}
                  </button>
                </>
              )}
              {tab === 'rosto' && (
                <>
                  <Swatches label="Tom de pele" colors={SKIN} value={cfg.skin} onPick={(c) => set({ skin: c })} />
                  {grid('eyes', EYES, 'Olhos')}
                  {grid('eyebrows', BROWS, 'Sobrancelhas')}
                  {grid('mouth', MOUTHS, 'Boca')}
                </>
              )}
              {tab === 'barba' && (
                <>
                  {cfg.sex === 'm' && grid('facialHair', BEARDS, 'Barba ou bigode', { '': 'Nenhum' })}
                  {cfg.sex === 'm' && cfg.facialHair && <Swatches label="Cor da barba" colors={HAIR} value={cfg.facialHairColor} onPick={(c) => set({ facialHairColor: c })} />}
                  {grid('accessories', GLASSES, 'Óculos', { '': 'Nenhum' })}
                </>
              )}
              {tab === 'roupa' && (
                <>
                  <Swatches label={cover ? 'Cor da roupa (e do lenço/chapéu)' : 'Cor da roupa'} colors={CLOTHES} value={cfg.clothes} onPick={(c) => set({ clothes: c })} />
                  {grid('clothing', CLOTHING, 'Estilo')}
                </>
              )}
              {tab === 'fundo' && <Swatches label="Cor do fundo" colors={BG} value={cfg.bg} onPick={(c) => set({ bg: c })} />}
            </div>
          </div>
          )}
        </div>
        <div className="avb-foot">
          <span className="avb-credit">Personagens: Avataaars, de Pablo Stanley</span>
          <button className="btn btn-primary btn-md" disabled={busy || !started} onClick={save}><Sparkles size={17} aria-hidden /> {busy ? 'Salvando…' : 'Salvar meu avatar'}</button>
        </div>
      </div>
    </div>
  );
}
