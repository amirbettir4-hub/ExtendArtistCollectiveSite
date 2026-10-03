import { useEffect, useRef, useState, type ReactNode } from "react";
import { TimelapseReplay } from "./components/TimelapseReplay";
import { LiveCanvas, type LiveCanvasHandle } from "./components/LiveCanvas";
import {
  usePersisted, uid,
  type Submission, type Post, type Inquiry, type User,
} from "./store";
import {
  useRealtimeRoom, useRemoteStrokes,
  type PresenceUser, type RoomMessage,
} from "./lib/realtime";
import { loadSubmissions, saveSubmission, incrementVote } from "./lib/db";
import { signInWithMagicLink, signOut as authSignOut, onAuthChange } from "./lib/auth";

console.log("SUPABASE CHECK →", import.meta.env.VITE_SUPABASE_URL);

/* ============ TYPES ============ */
type Section = "wall" | "studio" | "arena" | "auth";
type ArenaScreen = "lobby" | "prompt" | "canvas" | "watch" | "voting" | "results";
type StudioScreen = "feed" | "composer" | "room";
type WallScreen = "grid" | "detail" | "artists";
type AuthScreen = "signin" | "signup";
type Tool = "brush" | "eraser";
type IconName =
  | "arrow" | "bookmark" | "brush" | "chevron" | "circle"
  | "eraser" | "image" | "play" | "plus" | "redo" | "upload"
  | "menu" | "close" | "trash";
type Work = {
  id: number; image: string; title: string; artist: string;
  price: number; medium: string; dimensions: string; year: number; available: boolean;
};
type Realtime = {
  send: (msg: RoomMessage) => void;
  present: PresenceUser[];
  connected: boolean;
  lastMsg: RoomMessage | null;
  userId: string;
};

/* ============ DATA ============ */
const BATTLE_ID = 47;
const BATTLE_PROMPT = "Draw the place you go to disappear.";

const art = [
  "https://images.unsplash.com/photo-1533208087231-c3618eab623c?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1618331835717-801e976710b2?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1552312097-8ef75595e2a2?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1532640331846-d2da5987c3ee?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1531056416665-266c4099c928?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1534946445127-9e89ef27bc15?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1551619276-f77b2c749711?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1531132076534-0120b6aa12cd?auto=format&fit=crop&w=1200&q=85",
];
const portraits = [
  "https://images.unsplash.com/photo-1628359355624-855775b5c9c4?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1650783756107-739513b38177?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1551180452-aea351b23949?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1630519047643-0b31f2540a1c?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1619107187499-adbfd254e9ee?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1626555019243-638888e7dc3a?auto=format&fit=crop&w=320&q=80",
];
const artistNames = ["Theo K.", "Mara Vale", "June Ori", "Sam Dune", "Inez L.", "K. Moss"];

const artworks: Work[] = art.map((image, i) => ({
  id: i, image,
  title: ["Salt marsh study", "North room", "Before the city", "Blue hour no. 4",
    "Weather drawing", "Notes on leaving", "A softer boundary", "Interval"][i],
  artist: artistNames[i % artistNames.length],
  price: [420, 880, 1250, 600, 340, 1900, 720, 510][i],
  medium: ["Oil on linen", "Graphite", "Mixed media", "Acrylic",
    "Oil & graphite", "Digital", "Oil on canvas", "Charcoal"][i],
  dimensions: "60 × 80 cm", year: 2025, available: i % 4 !== 0,
}));

const seedPosts: Post[] = [
  { id: "p1", artist: "Mara Vale", handle: "@maravale", time: "Today, 10:42",
    status: "Finished", medium: "Oil & graphite", image: art[0], avatar: portraits[1],
    caption: "New studies from the edge of the salt marsh. Letting the graphite interrupt the oil this time.",
    createdAt: Date.now() - 3600_000 },
  { id: "p2", artist: "Theo K.", handle: "@theok", time: "Yesterday, 18:16",
    status: "WIP", medium: "Acrylic", image: art[5], avatar: portraits[0],
    caption: "Still finding the horizon. Version three, before I paint over the whole lower half.",
    createdAt: Date.now() - 86400_000 },
  { id: "p3", artist: "Inez L.", handle: "@inezlines", time: "Mon, 09:04",
    status: "Finished", medium: "Mixed media", image: art[1], avatar: portraits[4],
    caption: "A small record of weather moving through the room.",
    createdAt: Date.now() - 172800_000 },
];

const BRUSH_COLORS = ["#2b211a", "#c2571f", "#7a8b5a", "#3b5b7a", "#8a5a7a", "#fffdf8"];
const BRUSH_SIZES = [3, 8, 18, 36];

/* ============ ICON ============ */
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const p: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21Z" />,
    brush: <><path d="m14.5 4.5 5 5L10 19H5v-5Z" /><path d="m12 7 5 5" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    circle: <circle cx="12" cy="12" r="7" />,
    eraser: <><path d="m15 4 5 5-9 9H6l-3-3Z" /><path d="m11 18 4-4" /></>,
    image: <><rect x="3" y="4" width="18" height="16" /><circle cx="9" cy="10" r="2" /><path d="m3 17 5-4 4 3 3-2 6 4" /></>,
    play: <path d="m9 7 8 5-8 5Z" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    redo: <><path d="M4 10h11a5 5 0 0 1 5 5v1" /><path d="m8 6-4 4 4 4" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7v13h12V7" /></>,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24">{p[name]}</svg>;
}

/* ============ PRIMITIVES ============ */
function Button({ children, variant = "primary", disabled, onClick, className = "", type = "button" }: {
  children: ReactNode; variant?: "primary" | "outline" | "quiet" | "icon";
  disabled?: boolean; onClick?: () => void; className?: string; type?: "button" | "submit";
}) {
  return <button type={type} className={`button button--${variant} ${className}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

function StateBlock({ kind, message, action }: {
  kind: "empty" | "loading" | "error"; message: string; action?: ReactNode;
}) {
  if (kind === "loading") {
    return <div className="state"><div className="skeleton-grid">{Array.from({ length: 6 }).map((_, i) => <div className="skeleton" key={i} />)}</div></div>;
  }
  return <div className={`state state--${kind}`}><p className="state__message">{message}</p>{action}</div>;
}

/* ============ ROUTER ============ */
function useHashRoute() {
  const parse = () => {
    const hash = window.location.hash.replace(/^#\/?/, "") || "wall/grid";
    const [section, screen, param] = hash.split("/");
    return { section: (section || "wall") as Section, screen: screen || "grid", param: param || "" };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = (section: Section, screen: string, param?: string | number) => {
    window.location.hash = `#/${section}/${screen}${param !== undefined ? `/${param}` : ""}`;
    window.scrollTo(0, 0);
  };
  return { route, navigate };
}

/* ============ HEADER ============ */
function Header({ section, user, onSignOut, navigate }: {
  section: Section; user: User | null; onSignOut: () => void;
  navigate: (s: Section, screen: string, param?: string | number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <header className="header">
        <button className="wordmark" onClick={() => navigate("wall", "grid")} aria-label="Home">
          <span className="wordmark__mark">C</span>
          <span>COMMON<br />GROUND</span>
        </button>
        <nav className="primary-nav" aria-label="Primary">
          <button className={section === "wall" ? "active" : ""} onClick={() => navigate("wall", "grid")}>The Wall</button>
          <button className={section === "studio" ? "active" : ""} onClick={() => navigate("studio", "feed")}>Studio</button>
          <button className={section === "arena" ? "active" : ""} onClick={() => navigate("arena", "lobby")}>Arena</button>
        </nav>
        <div className="header__right">
          {user ? (
            <div className="user-chip">
              <span>{user.name || user.email.split("@")[0]}</span>
              <button onClick={onSignOut}>Sign out</button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => navigate("auth", "signin")}>Sign in</Button>
          )}
        </div>
        <button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
      </header>
      {menuOpen && (
        <div className="mobile-drawer">
          <button className="mobile-drawer__close" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
          <nav>
            <button onClick={() => { navigate("wall", "grid"); setMenuOpen(false); }}>The Wall</button>
            <button onClick={() => { navigate("studio", "feed"); setMenuOpen(false); }}>Studio</button>
            <button onClick={() => { navigate("arena", "lobby"); setMenuOpen(false); }}>Arena</button>
            {user
              ? <button onClick={() => { onSignOut(); setMenuOpen(false); }}>Sign out</button>
              : <button onClick={() => { navigate("auth", "signin"); setMenuOpen(false); }}>Sign in</button>}
          </nav>
        </div>
      )}
    </>
  );
}

function Subnav<T extends string>({ items, active, setActive }: {
  items: { id: T; label: string }[]; active: T; setActive: (id: T) => void;
}) {
  return (
    <nav className="subnav">
      {items.map((item, index) => (
        <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}>
          <span>0{index + 1}</span>{item.label}
        </button>
      ))}
    </nav>
  );
}

/* ============ WALL ============ */
function WallGrid({ navigate }: { navigate: (s: Section, screen: string, param?: string | number) => void }) {
  const [medium, setMedium] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [priceMax, setPriceMax] = useState(2000);
  const mediums = ["All", "Oil on linen", "Graphite", "Mixed media", "Acrylic", "Oil & graphite", "Digital", "Charcoal"];
  const filtered = artworks.filter((w) =>
    (medium === "All" || w.medium === medium) && (!availableOnly || w.available) && w.price <= priceMax
  );
  return (
    <main className="page wall">
      <div className="wall__intro">
        <span className="kicker">The Wall</span>
        <h1>Works from the<br /><em>collective.</em></h1>
        <p>Strict grid. No algorithm. Every work same size.<br />Available works marked with a dot.</p>
      </div>
      <div className="wall-filters">
        <div className="filter-chips">
          {mediums.map((m) => (
            <button key={m} className={medium === m ? "active" : ""} onClick={() => setMedium(m)}>{m}</button>
          ))}
        </div>
        <div className="filter-right">
          <label className="filter-toggle">
            <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
            <span>Available only</span>
          </label>
          <label className="filter-price">
            <span>Max €{priceMax}</span>
            <input type="range" min={200} max={2000} step={100} value={priceMax} onChange={(e) => setPriceMax(Number(e.target.value))} />
          </label>
          <span className="filter-count">{filtered.length} works</span>
        </div>
      </div>
      {filtered.length === 0 ? (
        <StateBlock kind="empty" message="No works match those filters."
          action={<Button variant="outline" onClick={() => { setMedium("All"); setAvailableOnly(false); setPriceMax(2000); }}>Clear filters</Button>} />
      ) : (
        <div className="wall-grid">
          {filtered.map((work) => (
            <button key={work.id} className="artwork-cell" onClick={() => navigate("wall", "detail", work.id)}>
              <div className="artwork-cell__mat"><img src={work.image} alt={work.title} /></div>
              <div className="artwork-cell__meta"><strong>{work.title}</strong><span>{work.artist}</span></div>
              {work.available && <i className="availability-dot" />}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function InquiryModal({ work, onClose, onSent }: { work: Work; onClose: () => void; onSent: (i: Inquiry) => void }) {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="modal__success">
            <span className="kicker">Sent</span>
            <h2>Inquiry received.</h2>
            <p>{work.artist} will reply to <strong>{email}</strong> within 48 hours.</p>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <div className="modal__head">
              <div><span className="kicker">Inquire about</span><h2>{work.title}</h2></div>
              <button className="modal__close" onClick={onClose}>✕</button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              onSent({ id: uid(), workId: work.id, workTitle: work.title, name, email, message, createdAt: Date.now() });
              setSent(true);
            }}>
              <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <label>Message<textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required /></label>
              <div className="modal__footer">
                <span className="modal__price">€{work.price.toLocaleString()}</span>
                <Button type="submit">Send inquiry <Icon name="arrow" /></Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ArtworkDetail({ id, navigate, onInquiry }: {
  id: number; navigate: (s: Section, screen: string, param?: string | number) => void;
  onInquiry: (i: Inquiry) => void;
}) {
  const [showInquiry, setShowInquiry] = useState(false);
  const work = artworks[id];
  if (!work) return <main className="page"><StateBlock kind="error" message="Work not found." action={<Button variant="outline" onClick={() => navigate("wall", "grid")}>Back to the Wall</Button>} /></main>;
  return (
    <main className="page artwork-detail">
      <button className="back-link" onClick={() => navigate("wall", "grid")}><Icon name="arrow" /> Back to the Wall</button>
      <div className="artwork-detail__layout">
        <div className="artwork-detail__image"><img src={work.image} alt={work.title} /></div>
        <div className="artwork-detail__info">
          <span className="kicker">{work.artist}</span>
          <h1>{work.title}</h1>
          <dl>
            <div><dt>Medium</dt><dd>{work.medium}</dd></div>
            <div><dt>Dimensions</dt><dd>{work.dimensions}</dd></div>
            <div><dt>Year</dt><dd>{work.year}</dd></div>
            <div><dt>Price</dt><dd>€{work.price.toLocaleString()}</dd></div>
            <div><dt>Status</dt><dd>{work.available ? "Available" : "Sold"}</dd></div>
          </dl>
          <Button onClick={() => setShowInquiry(true)} disabled={!work.available}>
            {work.available ? "Inquire" : "Sold"} <Icon name="arrow" />
          </Button>
          <Button variant="outline" onClick={() => navigate("studio", "room")}>View artist's room</Button>
        </div>
      </div>
      {showInquiry && <InquiryModal work={work} onClose={() => setShowInquiry(false)} onSent={onInquiry} />}
    </main>
  );
}

function ArtistsDirectory({ navigate }: { navigate: (s: Section, screen: string, param?: string | number) => void }) {
  return (
    <main className="page artists">
      <div className="artists__intro"><span className="kicker">Artists</span><h1>Six voices.</h1></div>
      <div className="artist-directory-grid">
        {artistNames.map((name, i) => (
          <button key={name} className="artist-card" onClick={() => navigate("studio", "room")}>
            <img src={portraits[i]} alt={name} /><strong>{name}</strong>
            <span>{["Painter · London", "Sculptor · Lisbon", "Mixed media · Berlin", "Printmaker · Oslo", "Textile · Marrakech", "Digital · Seoul"][i]}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

/* ============ ARENA ============ */
function ArenaLobby({ navigate }: { navigate: (s: Section, screen: string, param?: string | number) => void }) {
  const [seconds, setSeconds] = useState(14 * 60 + 27);
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((v) => (v > 0 ? v - 1 : 900)), 1000);
    return () => window.clearInterval(t);
  }, []);
  const time = `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <main className="lobby page">
      <div className="eyebrow"><span className="live-dot" />Next live battle</div>
      <div className="lobby__hero">
        <div>
          <h1>Make something<br /><em>unrepeatable.</em></h1>
          <p>One prompt. Twenty minutes. No revisions.<br />A live drawing session for the collective.</p>
        </div>
        <div className="countdown">
          <span>Doors open in</span><strong>{time}</strong>
          <small>Hours&nbsp;&nbsp;&nbsp;Minutes&nbsp;&nbsp;&nbsp;Seconds</small>
        </div>
      </div>
      <div className="lobby__action">
        <Button onClick={() => navigate("arena", "prompt")}>Enter the arena <Icon name="arrow" /></Button>
        <Button variant="outline" onClick={() => navigate("arena", "watch")}>Watch live</Button>
      </div>
      <section className="waiting">
        <div className="section-heading"><h2>Waiting now</h2><span>12 artists</span></div>
        <div className="avatar-grid">
          {portraits.map((portrait, index) => (
            <article className="artist-chip" key={portrait}>
              <img src={portrait} alt="" /><span>{artistNames[index]}</span><i />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function PromptReveal({ navigate }: { navigate: (s: Section, screen: string, param?: string | number) => void }) {
  return (
    <main className="prompt-screen">
      <div className="prompt-screen__top"><span>Tonight's prompt</span><span>Battle {BATTLE_ID}</span></div>
      <div className="prompt-screen__content">
        <span className="prompt-screen__count">3</span>
        <h1>Draw the place<br />you go <em>to disappear.</em></h1>
        <p>20 minutes · Any medium · One submission</p>
      </div>
      <Button variant="quiet" className="prompt-next" onClick={() => navigate("arena", "canvas")}>
        Skip countdown <Icon name="arrow" />
      </Button>
    </main>
  );
}

function CanvasView({ navigate, onSubmit, user, realtime }: {
  navigate: (s: Section, screen: string, param?: string | number) => void;
  onSubmit: (s: Submission) => void;
  user: User | null;
  realtime: Realtime;
}) {
  const canvasRef = useRef<LiveCanvasHandle>(null);
  const [secondsLeft, setSecondsLeft] = useState(20 * 60);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState(BRUSH_COLORS[0]);
  const [size, setSize] = useState(BRUSH_SIZES[1]);
  const [submitted, setSubmitted] = useState(false);

  const { remote, liveRef } = useRemoteStrokes(realtime.lastMsg, realtime.userId);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setInterval(() => setSecondsLeft((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [secondsLeft]);

  const time = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const timeUp = secondsLeft === 0;

  const handleSubmit = () => {
    if (!canvasRef.current || submitted) return;
    const strokes = canvasRef.current.getStrokes();
    const image = canvasRef.current.toDataURL();
    const name = user?.name || (user?.email ? user.email.split("@")[0] : "Guest");
    const sub: Submission = {
      id: uid(), artistName: name, artistAvatar: portraits[0],
      image, strokes, prompt: BATTLE_PROMPT, battleId: BATTLE_ID,
      createdAt: Date.now(), votes: 0,
    };
    onSubmit(sub);
    realtime.send({ type: "submission", submission: sub, userId: realtime.userId });
    setSubmitted(true);
    navigate("arena", "voting");
  };

  return (
    <main className="canvas-screen">
      <div className={`rt-badge ${!realtime.connected ? "rt-badge--off" : realtime.present.length > 1 ? "rt-badge--on" : ""}`}>
        <span className="live-dot" />
        {realtime.connected ? `Live · ${realtime.present.length} here` : "Connecting…"}
      </div>
      <div className="canvas-timer">
        <span>Time remaining</span><strong>{time}</strong>
        {!timeUp && <button className="canvas-skip" onClick={() => setSecondsLeft(0)}>skip (demo)</button>}
      </div>
      <div className="canvas-stage">
        <LiveCanvas
          ref={canvasRef} color={color} size={size} mode={tool} locked={timeUp}
          myUserId={realtime.userId} send={realtime.send}
          remoteStrokes={remote} liveStrokesRef={liveRef}
        />
      </div>
      <div className="toolbar">
        <button className={`toolbar__btn ${tool === "brush" ? "selected" : ""}`} onClick={() => setTool("brush")}><Icon name="brush" /><span>Brush</span></button>
        <button className={`toolbar__btn ${tool === "eraser" ? "selected" : ""}`} onClick={() => setTool("eraser")}><Icon name="eraser" /><span>Eraser</span></button>
        <div className="toolbar__colors">
          {BRUSH_COLORS.map((c) => (
            <button key={c} className={`toolbar__swatch ${color === c ? "selected" : ""}`}
              style={{ background: c }} onClick={() => { setColor(c); setTool("brush"); }} />
          ))}
        </div>
        <div className="toolbar__sizes">
          {BRUSH_SIZES.map((s) => (
            <button key={s} className={`toolbar__size ${size === s ? "selected" : ""}`} onClick={() => setSize(s)}>
              <span style={{ width: s, height: s }} />
            </button>
          ))}
        </div>
        <button className="toolbar__btn" onClick={() => canvasRef.current?.undo()}><Icon name="redo" /><span>Undo</span></button>
        <button className="toolbar__btn" onClick={() => canvasRef.current?.clear()}><Icon name="trash" /><span>Clear</span></button>
      </div>
      <Button disabled={!timeUp || submitted} className="canvas-submit" onClick={handleSubmit}>
        {submitted ? "Submitted" : timeUp ? "Submit work" : "Submit when time ends"}
      </Button>
    </main>
  );
}

function SpectatorView({ navigate, realtime }: {
  navigate: (s: Section, screen: string, param?: string | number) => void;
  realtime: Realtime;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { remote, liveRef } = useRemoteStrokes(realtime.lastMsg, realtime.userId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, 1200, 900);
      const all = [...remote, ...Object.values(liveRef.current)];
      for (const s of all) {
        if (s.points.length < 2) continue;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.lineWidth = s.size;
        ctx.strokeStyle = s.mode === "eraser" ? "#fffdf8" : s.color;
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [remote, liveRef]);

  const artists = realtime.present.filter((p) => p.role === "artist");

  return (
    <main className="canvas-screen canvas-screen--watch">
      <div className={`rt-badge ${!realtime.connected ? "rt-badge--off" : artists.length > 0 ? "rt-badge--on" : ""}`}>
        <span className="live-dot" />
        {realtime.connected ? `Live · ${realtime.present.length} here` : "Connecting…"}
      </div>
      <div className="spectator-badge"><span className="live-dot" />Watching live</div>
      <div className="canvas-stage">
        <canvas ref={canvasRef} width={1200} height={900} className="drawing-canvas drawing-canvas--watch" />
      </div>
      <div className="spectator-footer">
        <span>{artists.length === 0 ? "Waiting for artists…" : `${artists.length} artist${artists.length === 1 ? "" : "s"} drawing`}</span>
        <Button variant="outline" onClick={() => navigate("arena", "lobby")}>Back to lobby <Icon name="arrow" /></Button>
      </div>
    </main>
  );
}

function Voting({ navigate, submissions, onVote }: {
  navigate: (s: Section, screen: string, param?: string | number) => void;
  submissions: Submission[];
  onVote: (id: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const battle = submissions.filter((s) => s.battleId === BATTLE_ID);
  if (battle.length === 0) {
    return <main className="page"><StateBlock kind="empty" message="No submissions yet."
      action={<Button variant="outline" onClick={() => navigate("arena", "canvas")}>Enter the canvas</Button>} /></main>;
  }
  return (
    <main className="voting page">
      <div className="title-row">
        <div><span className="kicker">Blind vote</span><h1>Choose the work<br />that stays with you.</h1></div>
        <div className="vote-timer"><span>Voting closes in</span><strong>00:47</strong></div>
      </div>
      <div className="vote-grid">
        {battle.map((sub, index) => (
          <article className="vote-card" key={sub.id}>
            <div className="vote-card__image">
              <img src={sub.image} alt={`Anonymous submission ${index + 1}`} />
              <span>0{index + 1}</span>
            </div>
            <div className="vote-card__votes">{sub.votes} {sub.votes === 1 ? "vote" : "votes"}</div>
            <Button variant={picked === sub.id ? "primary" : "outline"} onClick={() => setPicked(sub.id)}>
              {picked === sub.id ? "Vote selected" : "Vote for this work"}
            </Button>
          </article>
        ))}
      </div>
      {picked && <Button className="confirm-vote" onClick={() => { onVote(picked); navigate("arena", "results"); }}>Confirm vote <Icon name="arrow" /></Button>}
    </main>
  );
}

function Results({ navigate, submissions }: {
  navigate: (s: Section, screen: string, param?: string | number) => void;
  submissions: Submission[];
}) {
  const battle = submissions.filter((s) => s.battleId === BATTLE_ID);
  const winner = battle.reduce<Submission | null>((best, s) => (!best || s.votes > best.votes ? s : best), null);
  if (!winner) return <main className="page"><StateBlock kind="empty" message="No results yet." /></main>;
  return (
    <main className="results page">
      <div className="results__heading">
        <div><span className="champion-mark">Champion · Battle {BATTLE_ID}</span><h1>A quiet place<br /><em>between places.</em></h1></div>
        <div className="winner">
          <img src={winner.artistAvatar} alt={winner.artistName} />
          <div><span>Created by</span><strong>{winner.artistName}</strong></div>
        </div>
      </div>
      <div className="winner-work">
        <img src={winner.image} alt="Winning artwork" />
        {winner.strokes && winner.strokes.length > 0 ? (
          <div className="replay replay--live"><TimelapseReplay strokes={winner.strokes} duration={8000} /></div>
        ) : (
          <div className="replay">
            <Button variant="icon"><Icon name="play" /></Button>
            <div><strong>Watch the process</strong><span>Timelapse for live works</span></div>
            <div className="replay__line"><i /></div><span>—</span>
          </div>
        )}
      </div>
      <div className="results__footer">
        <p>Winner by {winner.votes} {winner.votes === 1 ? "vote" : "votes"}.</p>
        <Button variant="outline" onClick={() => navigate("studio", "room")}>Visit {winner.artistName}'s artist room <Icon name="arrow" /></Button>
      </div>
    </main>
  );
}

/* ============ STUDIO ============ */
function StudioFeed({ posts, user, savedIds, toggleSaved }: {
  posts: Post[]; user: User | null; savedIds: string[]; toggleSaved: (id: string) => void;
}) {
  const sorted = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <main className="feed page">
      <div className="feed__intro">
        <span className="kicker">Studio journal</span>
        <h1>What we're<br /><em>making now.</em></h1>
        <p>Shared in order, as it happens.<br />No rankings. No recommendations.</p>
        {user && <p className="feed__you">Signed in as <strong>{user.name || user.email}</strong></p>}
      </div>
      <div className="feed-list">
        {sorted.map((post) => (
          <article className="post" key={post.id}>
            <header className="post__header">
              <img src={post.avatar} alt="" />
              <div><strong>{post.artist}</strong><span>{post.handle} · {post.time}</span></div>
              <Button variant="icon" className={savedIds.includes(post.id) ? "saved" : ""} onClick={() => toggleSaved(post.id)}>
                <Icon name="bookmark" /><span className="sr-only">Save</span>
              </Button>
            </header>
            <img className="post__art" src={post.image} alt={`Artwork by ${post.artist}`} />
            <div className="post__meta"><span>{post.status}</span><span>{post.medium}</span></div>
            <p>{post.caption}</p>
          </article>
        ))}
      </div>
    </main>
  );
}

function Composer({ onPost, user, navigate }: {
  onPost: (p: Post) => void; user: User | null;
  navigate: (s: Section, screen: string, param?: string | number) => void;
}) {
  const [mode, setMode] = useState<"WIP" | "Finished">("WIP");
  const [caption, setCaption] = useState("");
  const [medium, setMedium] = useState("");
  if (!user) {
    return <main className="page"><StateBlock kind="empty" message="Sign in to share your work."
      action={<Button variant="outline" onClick={() => navigate("auth", "signin")}>Sign in</Button>} /></main>;
  }
  const handlePost = () => {
    if (!caption.trim() || !medium) return;
    onPost({
      id: uid(), artist: user.name || user.email.split("@")[0],
      handle: "@" + user.email.split("@")[0], avatar: portraits[0],
      image: art[Math.floor(Math.random() * art.length)], status: mode, medium,
      caption: caption.trim(), time: "Just now", createdAt: Date.now(),
    });
    setCaption("");
  };
  return (
    <main className="composer page">
      <div className="composer__heading"><span className="kicker">New studio post</span><h1>Share what's<br /><em>on your table.</em></h1></div>
      <div className="composer__layout">
        <section className="upload-zone">
          <Icon name="image" size={32} />
          <h2>Add your work</h2>
          <p>For this demo, an image is chosen automatically.</p>
          <div>
            <Button><Icon name="upload" /> Upload image</Button>
            <Button variant="outline" onClick={() => navigate("arena", "canvas")}><Icon name="brush" /> Draw in Arena</Button>
          </div>
        </section>
        <section className="composer-form">
          <label>Caption<textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Tell us what you're working through…" /></label>
          <label>Medium
            <div className="select-wrap">
              <select value={medium} onChange={(e) => setMedium(e.target.value)}>
                <option value="" disabled>Select a medium</option>
                <option>Oil painting</option><option>Drawing</option><option>Digital</option><option>Mixed media</option>
              </select>
              <Icon name="chevron" />
            </div>
          </label>
          <fieldset>
            <legend>State of work</legend>
            <div className="segmented">
              <button className={mode === "WIP" ? "active" : ""} onClick={() => setMode("WIP")}><span>WIP</span><small>Still in process</small></button>
              <button className={mode === "Finished" ? "active" : ""} onClick={() => setMode("Finished")}><span>Finished</span><small>Ready to share</small></button>
            </div>
          </fieldset>
          <div className="composer-form__footer">
            <span>Posts appear chronologically.</span>
            <Button onClick={handlePost} disabled={!caption.trim() || !medium}>Post to studio <Icon name="arrow" /></Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function ArtistRoom() {
  return (
    <main className="room page">
      <div className="room__profile">
        <img src={portraits[2]} alt="June Ori" />
        <div><span className="kicker">Artist room · London</span><h1>June Ori</h1>
          <p>Painter working between memory, imagined architecture, and the color of early mornings.</p></div>
        <Button variant="outline">Visit website <Icon name="arrow" /></Button>
      </div>
      <nav className="room-tabs"><button>Works</button><button className="active">Process <span>08</span></button><button>About</button></nav>
      <div className="process-intro"><h2>Process</h2><p>Studies, false starts, and works still becoming.</p></div>
      <div className="process-grid">
        {art.slice(0, 6).map((image, index) => (
          <article key={image}>
            <img src={image} alt={`Work in progress ${index + 1}`} />
            <div><span>WIP · {["Oil on linen", "Graphite", "Mixed media"][index % 3]}</span>
              <strong>{["Before the city", "North room study", "A softer boundary", "Blue hour no. 4", "Weather drawing", "Notes on leaving"][index]}</strong></div>
          </article>
        ))}
      </div>
    </main>
  );
}

/* ============ AUTH ============ */
function AuthPage({ mode, navigate, onSignedIn }: {
  mode: AuthScreen;
  navigate: (s: Section, screen: string, param?: string | number) => void;
  onSignedIn: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignin = mode === "signin";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithMagicLink(email);
      onSignedIn(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <main className="auth page">
        <div className="auth__card">
          <span className="kicker">Check your email</span>
          <h1>Link sent</h1>
          <p className="auth__info">
            We sent a sign-in link to <strong>{email}</strong>.
            Open it from the same browser and you'll be logged in.
          </p>
          <Button variant="outline" onClick={() => setSent(false)}>Use a different email</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth page">
      <div className="auth__card">
        <span className="kicker">{isSignin ? "Welcome back" : "Join the collective"}</span>
        <h1>{isSignin ? "Sign in" : "Create account"}</h1>
        <form onSubmit={handleSubmit}>
          {!isSignin && (
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></label>
          )}
          <label>Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && <p className="auth__error">{error}</p>}
          <Button type="submit" disabled={busy || !email}>
            {busy ? "Sending…" : "Send sign-in link"} <Icon name="arrow" />
          </Button>
        </form>
        <button className="auth__switch" onClick={() => navigate("auth", isSignin ? "signup" : "signin")}>
          {isSignin ? "No account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}

/* ============ APP ============ */
export default function App() {
  const { route, navigate } = useHashRoute();
  const { section, screen, param } = route;

  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = usePersisted<Post[]>("cg.posts", seedPosts);
  const [submissions, setSubmissions] = usePersisted<Submission[]>("cg.submissions", []);
  const [inquiries, setInquiries] = usePersisted<Inquiry[]>("cg.inquiries", []);
  const [savedIds, setSavedIds] = usePersisted<string[]>("cg.saved", []);

  /* subscribe to real Supabase auth */
  useEffect(() => {
    const unsubscribe = onAuthChange((u) => setUser(u));
    return unsubscribe;
  }, []);

  /* load submissions from Supabase on first render */
  useEffect(() => {
    loadSubmissions(BATTLE_ID).then((rows) => {
      if (rows.length > 0) setSubmissions(rows);
    });
  }, []);

  /* shared realtime channel at App level */
  const [lastMsg, setLastMsg] = useState<RoomMessage | null>(null);
  const [guestId] = useState(() => `app-${Math.random().toString(36).slice(2, 8)}`);
  const userId = user?.email ?? guestId;
  const presence: PresenceUser = {
    userId,
    name: user?.name || (user?.email ? user.email.split("@")[0] : "Guest"),
    avatar: portraits[0],
    role: "artist",
    joinedAt: Date.now(),
  };
  const { send, present, connected } = useRealtimeRoom("047", presence, (m) => setLastMsg(m));
  const realtime: Realtime = { send, present, connected, lastMsg, userId };

  /* merge realtime submissions + votes into local state */
  useEffect(() => {
    if (!lastMsg) return;
    if (lastMsg.type === "submission") {
      setSubmissions((prev) =>
        prev.some((s) => s.id === lastMsg.submission.id) ? prev : [...prev, lastMsg.submission as Submission]
      );
    } else if (lastMsg.type === "vote") {
      setSubmissions((prev) =>
        prev.map((s) => (s.id === lastMsg.submissionId ? { ...s, votes: s.votes + 1 } : s))
      );
    }
  }, [lastMsg, setSubmissions]);

  const toggleSaved = (id: string) =>
    setSavedIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const addInquiry = (i: Inquiry) => setInquiries((v) => [i, ...v]);
  const addPost = (p: Post) => setPosts((v) => [p, ...v]);

  const addSubmission = (s: Submission) => {
    setSubmissions((v) => [...v, s]);
    saveSubmission(s);
  };

  const castVote = (id: string) => {
    setSubmissions((v) => v.map((s) => (s.id === id ? { ...s, votes: s.votes + 1 } : s)));
    send({ type: "vote", submissionId: id, userId });
    incrementVote(id);
  };

  void inquiries;

  const immersive = section === "arena" && (screen === "prompt" || screen === "canvas" || screen === "watch");
  const wallScreen: WallScreen =
    screen === "detail" ? "detail" : screen === "artists" ? "artists" : "grid";

  return (
    <div className={`app ${immersive ? "app--immersive" : ""}`}>
      {!immersive && (
        <Header
          section={section}
          user={user}
          onSignOut={() => { authSignOut(); setUser(null); }}
          navigate={navigate}
        />
      )}

      {!immersive && section === "wall" && (
        <Subnav
          items={[{ id: "grid" as WallScreen, label: "The Wall" }, { id: "artists" as WallScreen, label: "Artists" }]}
          active={wallScreen === "detail" ? "grid" : wallScreen}
          setActive={(id) => navigate("wall", id)}
        />
      )}
      {!immersive && section === "studio" && (
        <Subnav
          items={[
            { id: "feed" as StudioScreen, label: "Feed" },
            { id: "composer" as StudioScreen, label: "Composer" },
            { id: "room" as StudioScreen, label: "Artist room" },
          ]}
          active={screen as StudioScreen}
          setActive={(id) => navigate("studio", id)}
        />
      )}
      {!immersive && section === "arena" && (
        <Subnav
          items={[
            { id: "lobby" as ArenaScreen, label: "Lobby" },
            { id: "prompt" as ArenaScreen, label: "Prompt" },
            { id: "canvas" as ArenaScreen, label: "Canvas" },
            { id: "watch" as ArenaScreen, label: "Watch" },
            { id: "voting" as ArenaScreen, label: "Voting" },
            { id: "results" as ArenaScreen, label: "Results" },
          ]}
          active={screen as ArenaScreen}
          setActive={(id) => navigate("arena", id)}
        />
      )}

      {section === "wall" && wallScreen === "grid" && <WallGrid navigate={navigate} />}
      {section === "wall" && wallScreen === "detail" && (
        <ArtworkDetail id={parseInt(param || "0", 10)} navigate={navigate} onInquiry={addInquiry} />
      )}
      {section === "wall" && wallScreen === "artists" && <ArtistsDirectory navigate={navigate} />}

      {section === "arena" && screen === "lobby" && <ArenaLobby navigate={navigate} />}
      {section === "arena" && screen === "prompt" && <PromptReveal navigate={navigate} />}
      {section === "arena" && screen === "canvas" && (
        <CanvasView navigate={navigate} onSubmit={addSubmission} user={user} realtime={realtime} />
      )}
      {section === "arena" && screen === "watch" && <SpectatorView navigate={navigate} realtime={realtime} />}
      {section === "arena" && screen === "voting" && (
        <Voting navigate={navigate} submissions={submissions} onVote={castVote} />
      )}
      {section === "arena" && screen === "results" && (
        <Results navigate={navigate} submissions={submissions} />
      )}

      {section === "studio" && screen === "feed" && (
        <StudioFeed posts={posts} user={user} savedIds={savedIds} toggleSaved={toggleSaved} />
      )}
      {section === "studio" && screen === "composer" && (
        <Composer onPost={addPost} user={user} navigate={navigate} />
      )}
      {section === "studio" && screen === "room" && <ArtistRoom />}

      {section === "auth" && (
        <AuthPage
          mode={(screen as AuthScreen) || "signin"}
          navigate={navigate}
          onSignedIn={() => {}}
        />
      )}
    </div>
  );
}