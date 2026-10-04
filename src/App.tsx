import { useEffect, useRef, useState, type ReactNode } from "react";
import { TimelapseReplay } from "./components/TimelapseReplay";
import { LiveCanvas, type LiveCanvasHandle } from "./components/LiveCanvas";
import { ArenaChat } from "./components/ArenaChat";
import { ArtistDirectory, ArtistRoom, ArtistApply, AdminPanel } from "./components/ArtistPages";
import { SavedPage } from "./components/SavedPage";
import {
  uid,
  type Submission, type Post, type User,
} from "./store";
import {
  useRealtimeRoom, useRemoteStrokes, useSyncedPhase,
  type PresenceUser, type RoomMessage, type BattlePhase,
} from "./lib/realtime";
import {
  loadSubmissions, saveSubmission, castVote as castVoteDB,
  loadPosts, savePost,
  saveInquiry,
  loadArtworks, saveArtwork, type Artwork,
  loadMyArtist, type Artist,
  loadMySavedArtworkIds, setArtworkSaved,
} from "./lib/db";
import { signInWithMagicLink, signOut as authSignOut, onAuthChange } from "./lib/auth";

/* ============ TYPES ============ */
type Section = "wall" | "studio" | "arena" | "auth";
type ArenaScreen = "lobby" | "canvas" | "watch" | "voting" | "results";
type StudioScreen = "feed" | "post" | "composer" | "apply" | "admin" | "room" | "saved";
type WallScreen = "grid" | "detail" | "artists";
type AuthScreen = "signin" | "signup";
type Tool = "brush" | "eraser";
type SortMode = "newest" | "price-asc" | "price-desc" | "title";
type IconName =
  | "arrow" | "bookmark" | "brush" | "chevron" | "circle"
  | "eraser" | "image" | "play" | "plus" | "redo" | "upload"
  | "menu" | "close" | "trash";
type Work = Artwork;
export type Realtime = {
  send: (msg: RoomMessage) => void;
  present: PresenceUser[];
  connected: boolean;
  lastMsg: RoomMessage | null;
  userId: string;
  phase: BattlePhase;
  secondsLeft: number;
  prompt: string;
  startPhase: (p: BattlePhase, durationSec: number | null, prompt?: string) => void;
  isHost: boolean;
};

/* ============ DATA ============ */
const BATTLE_ID = 47;
const ADMIN_EMAILS = ["amirbettir4@gmail.com"];

const portraits = [
  "https://images.unsplash.com/photo-1628359355624-855775b5c9c4?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1650783756107-739513b38177?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1551180452-aea351b23949?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1630519047643-0b31f2540a1c?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1619107187499-adbfd254e9ee?auto=format&fit=crop&w=320&q=80",
  "https://images.unsplash.com/photo-1626555019243-638888e7dc3a?auto=format&fit=crop&w=320&q=80",
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
    window.location.hash = `#/${section}/${screen}${param !== undefined && param !== "" ? `/${param}` : ""}`;
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
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  const hash = typeof window !== "undefined" ? window.location.hash : "";
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
          {isAdmin && (
            <button className={hash.includes("/studio/admin") ? "active" : ""} onClick={() => navigate("studio", "admin")}>
              Admin
            </button>
          )}
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
            {isAdmin && (
              <button onClick={() => { navigate("studio", "admin"); setMenuOpen(false); }}>Admin</button>
            )}
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
function WallGrid({ navigate, artworks, loading, savedIds, onToggleSaved, user }: {
  navigate: (s: Section, screen: string, param?: string | number) => void;
  artworks: Work[];
  loading: boolean;
  savedIds: string[];
  onToggleSaved: (id: string) => void;
  user: User | null;
}) {
  const [medium, setMedium] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [priceMax, setPriceMax] = useState(5000);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");

  const mediums = ["All", ...Array.from(new Set(artworks.map((w) => w.medium)))];
  const query = search.trim().toLowerCase();

  const filtered = artworks.filter((w) => {
    if (medium !== "All" && w.medium !== medium) return false;
    if (availableOnly && !w.available) return false;
    if (w.price > priceMax) return false;
    if (query) {
      const haystack = `${w.title} ${w.artistName} ${w.medium}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "price-asc": return a.price - b.price;
      case "price-desc": return b.price - a.price;
      case "title": return a.title.localeCompare(b.title);
      default: return b.createdAt - a.createdAt;
    }
  });

  const hasFilters = medium !== "All" || availableOnly || priceMax < 5000 || query !== "";
  const clearAll = () => {
    setMedium("All");
    setAvailableOnly(false);
    setPriceMax(5000);
    setSearch("");
    setSort("newest");
  };

  if (loading) {
    return <main className="page wall"><StateBlock kind="loading" message="Loading the Wall…" /></main>;
  }

  return (
    <main className="page wall">
      <div className="wall__intro">
        <span className="kicker">The Wall</span>
        <h1>Works from the<br /><em>collective.</em></h1>
        <p>Strict grid. No algorithm. Every work same size.<br />Available works marked with a dot.</p>
      </div>

      <div className="wall-search">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, artist, or medium…"
          aria-label="Search artworks"
        />
        {search && (
          <button className="wall-search__clear" onClick={() => setSearch("")} aria-label="Clear search">
            ✕
          </button>
        )}
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
            <input type="range" min={100} max={5000} step={100} value={priceMax} onChange={(e) => setPriceMax(Number(e.target.value))} />
          </label>
          <label className="filter-sort">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="newest">Newest</option>
              <option value="price-asc">Price ↑</option>
              <option value="price-desc">Price ↓</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
          <span className="filter-count">{sorted.length} work{sorted.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {artworks.length === 0 ? (
        <StateBlock
          kind="empty"
          message="No works on the Wall yet. Be the first to list one."
          action={<Button onClick={() => navigate("studio", "composer")}>List a work <Icon name="arrow" /></Button>}
        />
      ) : sorted.length === 0 ? (
        <StateBlock
          kind="empty"
          message={query ? `No works match "${search}".` : "No works match those filters."}
          action={hasFilters ? <Button variant="outline" onClick={clearAll}>Clear all filters</Button> : undefined}
        />
      ) : (
        <div className="wall-grid">
          {sorted.map((work) => {
            const isSaved = savedIds.includes(work.id);
            return (
              <div key={work.id} className="artwork-cell artwork-cell--static">
                <button
                  className="artwork-cell__mat"
                  onClick={() => navigate("wall", "detail", work.id)}
                  style={{ border: 0, padding: 0, background: "transparent", cursor: "pointer" }}
                >
                  <img src={work.image} alt={work.title} />
                </button>
                <div className="artwork-cell__meta">
                  <strong>{work.title}</strong>
                  <span>{work.artistName}</span>
                </div>
                {work.available && <i className="availability-dot" />}
                {user && (
                  <button
                    className={`artwork-cell__save ${isSaved ? "saved" : ""}`}
                    onClick={(e) => { e.stopPropagation(); onToggleSaved(work.id); }}
                    aria-label={isSaved ? "Remove from saved" : "Save to collection"}
                  >
                    <Icon name="bookmark" size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function InquiryModal({ work, onClose }: { work: Work; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await saveInquiry(
      parseInt(work.id.slice(0, 8), 16),
      work.title,
      work.artistName,
      name,
      email,
      message
    );
    setBusy(false);
    if (!ok) { setError("Could not send. Try again."); return; }
    setSent(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="modal__success">
            <span className="kicker">Sent</span>
            <h2>Inquiry received.</h2>
            <p>{work.artistName} will reply to <strong>{email}</strong> within 48 hours.</p>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <div className="modal__head">
              <div><span className="kicker">Inquire about</span><h2>{work.title}</h2></div>
              <button className="modal__close" onClick={onClose}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <label>Message<textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required /></label>
              {error && <p className="auth__error">{error}</p>}
              <div className="modal__footer">
                <span className="modal__price">€{work.price.toLocaleString()}</span>
                <Button type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Send inquiry"} <Icon name="arrow" />
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ArtworkDetail({ id, navigate, artworks, artists, savedIds, onToggleSaved, user }: {
  id: string;
  navigate: (s: Section, screen: string, param?: string | number) => void;
  artworks: Work[];
  artists: Artist[];
  savedIds: string[];
  onToggleSaved: (id: string) => void;
  user: User | null;
}) {
  const [showInquiry, setShowInquiry] = useState(false);
  const work = artworks.find((w) => w.id === id);

  if (!work) {
    return (
      <main className="page">
        <StateBlock kind="error" message="Work not found."
          action={<Button variant="outline" onClick={() => navigate("wall", "grid")}>Back to the Wall</Button>} />
      </main>
    );
  }

  const ownerArtist = artists.find((a) => a.userId === work.artistId);
  const isSaved = savedIds.includes(work.id);

  return (
    <main className="page artwork-detail">
      <button className="back-link" onClick={() => navigate("wall", "grid")}>
        <Icon name="arrow" /> Back to the Wall
      </button>
      <div className="artwork-detail__layout">
        <div className="artwork-detail__image"><img src={work.image} alt={work.title} /></div>
        <div className="artwork-detail__info">
          <span className="kicker">{work.artistName}</span>
          <h1>{work.title}</h1>
          <dl>
            <div><dt>Medium</dt><dd>{work.medium}</dd></div>
            <div><dt>Dimensions</dt><dd>{work.dimensions || "—"}</dd></div>
            <div><dt>Year</dt><dd>{work.year}</dd></div>
            <div><dt>Price</dt><dd>€{work.price.toLocaleString()}</dd></div>
            <div><dt>Status</dt><dd>{work.available ? "Available" : "Sold"}</dd></div>
          </dl>
          <Button onClick={() => setShowInquiry(true)} disabled={!work.available}>
            {work.available ? "Inquire" : "Sold"} <Icon name="arrow" />
          </Button>
          {user && (
            <Button variant="outline" onClick={() => onToggleSaved(work.id)}>
              {isSaved ? "Remove from collection" : "Save to collection"}
            </Button>
          )}
          {ownerArtist && (
            <Button variant="outline" onClick={() => navigate("studio", "room", ownerArtist.id)}>
              Visit {ownerArtist.name}'s room
            </Button>
          )}
        </div>
      </div>
      {showInquiry && <InquiryModal work={work} onClose={() => setShowInquiry(false)} />}
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
        <Button onClick={() => navigate("arena", "canvas")}>Enter the arena <Icon name="arrow" /></Button>
        <Button variant="outline" onClick={() => navigate("arena", "watch")}>Watch live</Button>
      </div>
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
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState(BRUSH_COLORS[0]);
  const [size, setSize] = useState(BRUSH_SIZES[1]);
  const [submitted, setSubmitted] = useState(false);

  const { remote, liveRef } = useRemoteStrokes(realtime.lastMsg, realtime.userId);

  useEffect(() => {
    if (!realtime.isHost) return;
    if (realtime.phase !== "countdown") return;
    if (realtime.secondsLeft > 0) return;
    realtime.startPhase("drawing", 20 * 60);
  }, [realtime.phase, realtime.secondsLeft, realtime.isHost]);

  useEffect(() => {
    if (!realtime.isHost) return;
    if (realtime.phase !== "drawing") return;
    if (realtime.secondsLeft > 0) return;
    realtime.startPhase("voting", 60);
  }, [realtime.phase, realtime.secondsLeft, realtime.isHost]);

  const time = `${String(Math.floor(realtime.secondsLeft / 60)).padStart(2, "0")}:${String(realtime.secondsLeft % 60).padStart(2, "0")}`;
  const canDraw = realtime.phase === "drawing" && realtime.secondsLeft > 0;

  const handleSubmit = () => {
    if (!canvasRef.current || submitted) return;
    if (!user) { alert("Sign in first to submit your work."); navigate("auth", "signin"); return; }
    if (realtime.phase !== "drawing" && realtime.phase !== "voting") { alert("Wait for the drawing phase."); return; }
    const strokes = canvasRef.current.getStrokes();
    const image = canvasRef.current.toDataURL();
    const name = user?.name || (user?.email ? user.email.split("@")[0] : "Guest");
    const sub: Submission = {
      id: uid(), artistName: name, artistAvatar: portraits[0],
      image, strokes, prompt: realtime.prompt, battleId: BATTLE_ID,
      createdAt: Date.now(), votes: 0,
    };
    onSubmit(sub);
    realtime.send({ type: "submission", submission: sub, userId: realtime.userId });
    setSubmitted(true);
    navigate("arena", "voting");
  };

  if (realtime.phase === "lobby") {
    return (
      <main className="canvas-screen">
        <div className={`rt-badge ${!realtime.connected ? "rt-badge--off" : realtime.present.length > 1 ? "rt-badge--on" : ""}`}>
          <span className="live-dot" />
          {realtime.connected ? `Live · ${realtime.present.length} here` : "Connecting…"}
        </div>
        <div className="canvas-waiting">
          <span className="kicker">Battle {BATTLE_ID} · Waiting for artists</span>
          <h1>Ready when<br /><em>you are.</em></h1>
          <p>{realtime.present.length} in the room</p>
          {realtime.isHost ? (
            <Button onClick={() => realtime.startPhase("countdown", 3)}>Start the battle <Icon name="arrow" /></Button>
          ) : (
            <p className="canvas-waiting__hint">Waiting for the host to start…</p>
          )}
        </div>
        <ArenaChat realtime={realtime} />
      </main>
    );
  }

  if (realtime.phase === "countdown") {
    return (
      <main className="prompt-screen">
        <div className="prompt-screen__top"><span>Tonight's prompt</span><span>Battle {BATTLE_ID}</span></div>
        <div className="prompt-screen__content">
          <span className="prompt-screen__count">{realtime.secondsLeft || 3}</span>
          <h1>{realtime.prompt}</h1>
          <p>20 minutes · Any medium · One submission</p>
        </div>
      </main>
    );
  }

  if (realtime.phase === "voting" && !submitted) {
    return (
      <main className="page">
        <StateBlock kind="empty" message="Time's up. Submissions are closed."
          action={<Button onClick={() => navigate("arena", "voting")}>Go to voting <Icon name="arrow" /></Button>} />
      </main>
    );
  }

  return (
    <main className="canvas-screen">
      <div className={`rt-badge ${!realtime.connected ? "rt-badge--off" : realtime.present.length > 1 ? "rt-badge--on" : ""}`}>
        <span className="live-dot" />
        {realtime.connected ? `Live · ${realtime.present.length} here` : "Connecting…"}
      </div>
      <div className="canvas-timer">
        <span>{canDraw ? "Time remaining" : "Time up"}</span>
        <strong>{canDraw ? time : "00:00"}</strong>
      </div>
      <div className="canvas-stage">
        <LiveCanvas
          ref={canvasRef} color={color} size={size} mode={tool} locked={!canDraw}
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
      <Button disabled={canDraw || submitted} className="canvas-submit" onClick={handleSubmit}>
        {submitted ? "Submitted" : canDraw ? "Submit when time ends" : "Submit work"}
      </Button>
      <ArenaChat realtime={realtime} />
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
  const time = `${String(Math.floor(realtime.secondsLeft / 60)).padStart(2, "0")}:${String(realtime.secondsLeft % 60).padStart(2, "0")}`;

  return (
    <main className="canvas-screen canvas-screen--watch">
      <div className={`rt-badge ${!realtime.connected ? "rt-badge--off" : artists.length > 0 ? "rt-badge--on" : ""}`}>
        <span className="live-dot" />
        {realtime.connected ? `Live · ${realtime.present.length} here` : "Connecting…"}
      </div>
      <div className="spectator-badge"><span className="live-dot" />Watching live</div>
      <div className="canvas-timer">
        <span>Battle {BATTLE_ID} · {realtime.phase === "drawing" ? "Time remaining" : realtime.phase}</span>
        <strong>{realtime.phase === "drawing" ? time : "—:—"}</strong>
      </div>
      <div className="canvas-stage">
        <canvas ref={canvasRef} width={1200} height={900} className="drawing-canvas drawing-canvas--watch" />
      </div>
      <div className="spectator-footer">
        <span>
          {realtime.phase === "lobby" ? "Waiting for the battle to start…" :
           `${artists.length} artist${artists.length === 1 ? "" : "s"} in the room`}
        </span>
        <Button variant="outline" onClick={() => navigate("arena", "lobby")}>Back to lobby <Icon name="arrow" /></Button>
      </div>
      <ArenaChat realtime={realtime} />
    </main>
  );
}

function Voting({ navigate, submissions, onVote, user }: {
  navigate: (s: Section, screen: string, param?: string | number) => void;
  submissions: Submission[];
  onVote: (id: string) => void;
  user: User | null;
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
      {!user && (
        <div className="vote-warning">
          <span>Sign in to vote.</span>
          <Button variant="outline" onClick={() => navigate("auth", "signin")}>Sign in</Button>
        </div>
      )}
      <div className="vote-grid">
        {battle.map((sub, index) => (
          <article className="vote-card" key={sub.id}>
            <div className="vote-card__image">
              <img src={sub.image} alt={`Submission ${index + 1}`} />
              <span>0{index + 1}</span>
            </div>
            <div className="vote-card__votes">{sub.votes} {sub.votes === 1 ? "vote" : "votes"}</div>
            <Button variant={picked === sub.id ? "primary" : "outline"} disabled={!user} onClick={() => setPicked(sub.id)}>
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
      </div>
    </main>
  );
}

/* ============ STUDIO ============ */
function StudioFeed({ posts, user, savedIds, toggleSaved, loading, navigate }: {
  posts: Post[]; user: User | null; savedIds: string[];
  toggleSaved: (id: string) => void; loading: boolean;
  navigate: (s: Section, screen: string, param?: string | number) => void;
}) {
  const sorted = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  if (loading) return <main className="feed page"><StateBlock kind="loading" message="Loading posts…" /></main>;

  const intro = (
    <div className="feed__intro">
      <span className="kicker">Studio journal</span>
      <h1>What we're<br /><em>making now.</em></h1>
      <p>Shared in order, as it happens.<br />No rankings. No recommendations.</p>
      {user && <p className="feed__you">Signed in as <strong>{user.name || user.email}</strong></p>}
      <div style={{ marginTop: "1.5rem" }}>
        <button className="button" onClick={() => navigate("studio", "post")}>
          New post
        </button>
      </div>
    </div>
  );

  if (sorted.length === 0) {
    return (
      <main className="feed page">
        {intro}
        <div className="feed-list">
          <StateBlock kind="empty" message="No posts yet. Be the first to share." />
        </div>
      </main>
    );
  }
  return (
    <main className="feed page">
      {intro}
      <div className="feed-list">
        {sorted.map((post) => (
          <article className="post" key={post.id}>
            <header className="post__header">
              {post.avatar ? <img src={post.avatar} alt="" /> : <div className="post__avatar-fallback">{post.artist.slice(0, 1)}</div>}
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

function NewPostComposer({ user, navigate, onPosted }: {
  user: User | null;
  navigate: (s: Section, screen: string, param?: string | number) => void;
  onPosted: (p: Post) => void;
}) {
  const [mode, setMode] = useState<"WIP" | "Finished">("WIP");
  const [caption, setCaption] = useState("");
  const [medium, setMedium] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <main className="page">
        <StateBlock kind="empty" message="Sign in to share a post."
          action={<Button variant="outline" onClick={() => navigate("auth", "signin")}>Sign in</Button>} />
      </main>
    );
  }

  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const submit = async () => {
    if (!caption.trim() || !medium.trim() || !image) {
      setError("Fill in caption, medium, and pick an image.");
      return;
    }
    setBusy(true);
    setError(null);

    const newId = uid();
    const post: Post = {
      id: newId,
      artist: user.name || user.email.split("@")[0],
      handle: "@" + user.email.split("@")[0],
      avatar: "",
      image: image,
      status: mode,
      medium: medium.trim(),
      caption: caption.trim(),
      time: "Just now",
      createdAt: Date.now(),
    };

    const ok = await savePost(post, image);
    setBusy(false);
    if (!ok) { setError("Could not save post. Try again."); return; }
    onPosted(post);
    navigate("studio", "feed");
  };

  return (
    <main className="composer page">
      <div className="composer__heading">
        <span className="kicker">New studio post</span>
        <h1>Share what's<br /><em>on your table.</em></h1>
      </div>
      <div className="composer__layout">
        <section className="upload-zone" onClick={pickImage} style={{ cursor: "pointer" }}>
          {image ? (
            <img src={image} alt="Preview" style={{ maxHeight: "24rem", objectFit: "contain" }} />
          ) : (
            <>
              <Icon name="image" size={32} />
              <h2>Pick an image</h2>
              <p>Click to upload. JPG, PNG or WEBP.</p>
            </>
          )}
        </section>
        <section className="composer-form">
          <label>Caption
            <textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Tell us what you're working through…" />
          </label>
          <label>Medium
            <input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="e.g. Oil on linen" />
          </label>
          <fieldset>
            <legend>State of work</legend>
            <div className="segmented">
              <button className={mode === "WIP" ? "active" : ""} onClick={() => setMode("WIP")}>
                <span>WIP</span><small>Still in process</small>
              </button>
              <button className={mode === "Finished" ? "active" : ""} onClick={() => setMode("Finished")}>
                <span>Finished</span><small>Ready to share</small>
              </button>
            </div>
          </fieldset>
          {error && <p className="auth__error">{error}</p>}
          <div className="composer-form__footer">
            <span>Posts appear chronologically.</span>
            <Button onClick={submit} disabled={busy}>{busy ? "Posting…" : "Post to studio"} <Icon name="arrow" /></Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function ListWorkComposer({ user, navigate, onListed, myArtist }: {
  user: User | null;
  navigate: (s: Section, screen: string, param?: string | number) => void;
  onListed: (art: Artwork) => void;
  myArtist: Artist | null;
}) {
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <main className="page">
        <StateBlock kind="empty" message="Sign in to list a work."
          action={<Button variant="outline" onClick={() => navigate("auth", "signin")}>Sign in</Button>} />
      </main>
    );
  }

  if (!myArtist || myArtist.status !== "approved") {
    return (
      <main className="page">
        <div className="artists__intro">
          <span className="kicker">Listing</span>
          <h1>{myArtist ? "Pending approval." : "Become an artist."}</h1>
        </div>
        <div className="apply-status apply-status--pending">
          {myArtist
            ? "Your application is under review. You'll be able to list work once approved."
            : "To list work on the Wall, apply to join the collective first."}
        </div>
        <div style={{ marginTop: "1.5rem" }}>
          <Button onClick={() => navigate("studio", "apply")}>
            {myArtist ? "View application" : "Apply now"} <Icon name="arrow" />
          </Button>
        </div>
      </main>
    );
  }

  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleList = async () => {
    if (!title.trim() || !medium.trim() || !price || !image) {
      setError("Fill in title, medium, price, and pick an image.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await saveArtwork(
      {
        artistName: myArtist.name,
        title: title.trim(),
        image: "",
        medium: medium.trim(),
        dimensions: dimensions.trim(),
        year,
        price: parseInt(price, 10),
        available: true,
      },
      image
    );
    setBusy(false);
    if (!result) { setError("Could not list the work. Try again."); return; }
    onListed(result);
    navigate("wall", "grid");
  };

  return (
    <main className="composer page">
      <div className="composer__heading">
        <span className="kicker">List a new work</span>
        <h1>Put something<br /><em>on the Wall.</em></h1>
      </div>
      <div className="composer__layout">
        <section className="upload-zone" onClick={pickImage} style={{ cursor: "pointer" }}>
          {image ? (
            <img src={image} alt="Preview" style={{ maxHeight: "24rem", objectFit: "contain" }} />
          ) : (
            <>
              <Icon name="image" size={32} />
              <h2>Pick an image</h2>
              <p>Click to upload. JPG, PNG or WEBP.</p>
            </>
          )}
        </section>
        <section className="composer-form">
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Salt marsh study" /></label>
          <label>Medium<input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="e.g. Oil on linen" /></label>
          <label>Dimensions<input value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="e.g. 60 × 80 cm" /></label>
          <label>Year<input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())} /></label>
          <label>Price (€)<input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 850" /></label>
          {error && <p className="auth__error">{error}</p>}
          <div className="composer-form__footer">
            <span>Will appear on The Wall immediately.</span>
            <Button onClick={handleList} disabled={busy}>{busy ? "Listing…" : "List work"} <Icon name="arrow" /></Button>
          </div>
        </section>
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
          <p className="auth__info">We sent a sign-in link to <strong>{email}</strong>.</p>
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
          {!isSignin && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></label>}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
          {error && <p className="auth__error">{error}</p>}
          <Button type="submit" disabled={busy || !email}>{busy ? "Sending…" : "Send sign-in link"} <Icon name="arrow" /></Button>
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [artworksLoading, setArtworksLoading] = useState(true);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [postSaves, setPostSaves] = useState<string[]>([]);
  const [savedArtworkIds, setSavedArtworkIds] = useState<string[]>([]);
  const [myArtist, setMyArtist] = useState<Artist | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthChange((u) => setUser(u));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.email) {
      setMyArtist(null);
      setSavedArtworkIds([]);
      return;
    }
    import("./lib/supabase").then(({ supabase }) => {
      if (!supabase) return;
      supabase.auth.getUser().then(({ data }) => {
        const uid2 = data.user?.id;
        if (!uid2) return;
        loadMyArtist(uid2).then(setMyArtist);
      });
    });
    loadMySavedArtworkIds().then(setSavedArtworkIds);
  }, [user]);

  const loadArtistsAll = () =>
    import("./lib/db").then(({ loadArtists }) => loadArtists().then(setArtists));

  useEffect(() => { loadSubmissions(BATTLE_ID).then(setSubmissions); }, []);
  useEffect(() => {
    setPostsLoading(true);
    loadPosts().then((rows) => { setPosts(rows); setPostsLoading(false); });
  }, []);
  useEffect(() => {
    setArtworksLoading(true);
    loadArtworks().then((rows) => { setArtworks(rows); setArtworksLoading(false); });
  }, []);
  useEffect(() => { loadArtistsAll(); }, []);

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
  const { phase, secondsLeft, prompt, startPhase } = useSyncedPhase(lastMsg, send, userId);

  const artistsInRoom = present.filter((p) => p.role === "artist");
  const host = artistsInRoom.length > 0 ? artistsInRoom.reduce((a, b) => (a.joinedAt < b.joinedAt ? a : b)) : null;
  const isHost = host?.userId === userId;

  const realtime: Realtime = {
    send, present, connected, lastMsg, userId,
    phase, secondsLeft, prompt, startPhase, isHost,
  };

  useEffect(() => {
    if (!lastMsg) return;
    if (lastMsg.type === "submission") {
      setSubmissions((prev) =>
        prev.some((s) => s.id === lastMsg.submission.id) ? prev : [...prev, lastMsg.submission as Submission]
      );
    } else if (lastMsg.type === "vote") {
      setSubmissions((prev) => prev.map((s) => (s.id === lastMsg.submissionId ? { ...s, votes: s.votes + 1 } : s)));
    }
  }, [lastMsg]);

  const togglePostSave = (id: string) =>
    setPostSaves((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const toggleArtworkSaved = async (artworkId: string) => {
    if (!user) {
      navigate("auth", "signin");
      return;
    }
    const isSaved = savedArtworkIds.includes(artworkId);
    setSavedArtworkIds((v) =>
      isSaved ? v.filter((x) => x !== artworkId) : [...v, artworkId]
    );
    const ok = await setArtworkSaved(artworkId, !isSaved);
    if (!ok) {
      setSavedArtworkIds((v) =>
        isSaved ? [...v, artworkId] : v.filter((x) => x !== artworkId)
      );
      alert("Could not update collection. Try again.");
    }
  };

  const addSubmission = async (s: Submission) => {
    setSubmissions((v) => [...v, s]);
    const ok = await saveSubmission(s);
    if (!ok) {
      alert("Could not save submission. Please sign in first.");
      setSubmissions((v) => v.filter((x) => x.id !== s.id));
    }
  };

  const castVote = async (id: string) => {
    setSubmissions((v) => v.map((s) => (s.id === id ? { ...s, votes: s.votes + 1 } : s)));
    send({ type: "vote", submissionId: id, userId });
    const ok = await castVoteDB(id);
    if (!ok) {
      setSubmissions((v) => v.map((s) => (s.id === id ? { ...s, votes: s.votes - 1 } : s)));
      alert("Could not save vote. Please sign in first.");
    }
  };

  const immersive = section === "arena" && (screen === "canvas" || screen === "watch");
  const wallScreen: WallScreen =
    screen === "detail" ? "detail" : screen === "artists" ? "artists" : "grid";

  const isRoom = section === "studio" && screen === "room" && !!param;
  const roomId = isRoom ? param : "";

  const isKnown =
    (section === "wall" && (wallScreen === "grid" || wallScreen === "detail" || wallScreen === "artists")) ||
    (section === "arena" && (screen === "lobby" || screen === "canvas" || screen === "watch" || screen === "voting" || screen === "results")) ||
    (section === "studio" && (screen === "feed" || screen === "post" || screen === "composer" || screen === "apply" || screen === "admin" || screen === "saved" || isRoom)) ||
    section === "auth";

  return (
    <div className={`app ${immersive ? "app--immersive" : ""}`}>
      {!immersive && (
        <Header section={section} user={user} onSignOut={() => { authSignOut(); setUser(null); }} navigate={navigate} />
      )}

      {!immersive && section === "wall" && (
        <Subnav
          items={[{ id: "grid" as WallScreen, label: "The Wall" }, { id: "artists" as WallScreen, label: "Artists" }]}
          active={wallScreen === "detail" ? "grid" : wallScreen}
          setActive={(id) => navigate("wall", id)}
        />
      )}
      {!immersive && section === "studio" && !isRoom && (
        <Subnav
          items={[
            { id: "feed" as StudioScreen, label: "Feed" },
            { id: "post" as StudioScreen, label: "New post" },
            { id: "composer" as StudioScreen, label: "List a work" },
            { id: "saved" as StudioScreen, label: "Collection" },
            { id: "apply" as StudioScreen, label: "My profile" },
          ]}
          active={(
            screen === "feed" ? "feed" :
            screen === "post" ? "post" :
            screen === "composer" ? "composer" :
            screen === "saved" ? "saved" :
            screen === "apply" ? "apply" :
            "feed"
          ) as StudioScreen}
          setActive={(id) => navigate("studio", id)}
        />
      )}
      {!immersive && section === "arena" && (
        <Subnav
          items={[
            { id: "lobby" as ArenaScreen, label: "Lobby" },
            { id: "canvas" as ArenaScreen, label: "Canvas" },
            { id: "watch" as ArenaScreen, label: "Watch" },
            { id: "voting" as ArenaScreen, label: "Voting" },
            { id: "results" as ArenaScreen, label: "Results" },
          ]}
          active={screen as ArenaScreen}
          setActive={(id) => navigate("arena", id)}
        />
      )}

      {section === "wall" && wallScreen === "grid" && (
        <WallGrid
          navigate={navigate}
          artworks={artworks}
          loading={artworksLoading}
          savedIds={savedArtworkIds}
          onToggleSaved={toggleArtworkSaved}
          user={user}
        />
      )}
      {section === "wall" && wallScreen === "detail" && (
        <ArtworkDetail
          id={param}
          navigate={navigate}
          artworks={artworks}
          artists={artists}
          savedIds={savedArtworkIds}
          onToggleSaved={toggleArtworkSaved}
          user={user}
        />
      )}
      {section === "wall" && wallScreen === "artists" && <ArtistDirectory navigate={navigate} />}

      {section === "arena" && screen === "lobby" && <ArenaLobby navigate={navigate} />}
      {section === "arena" && screen === "canvas" && (
        <CanvasView navigate={navigate} onSubmit={addSubmission} user={user} realtime={realtime} />
      )}
      {section === "arena" && screen === "watch" && <SpectatorView navigate={navigate} realtime={realtime} />}
      {section === "arena" && screen === "voting" && (
        <Voting navigate={navigate} submissions={submissions} onVote={castVote} user={user} />
      )}
      {section === "arena" && screen === "results" && (
        <Results navigate={navigate} submissions={submissions} />
      )}

      {section === "studio" && screen === "feed" && (
        <StudioFeed
          posts={posts}
          user={user}
          savedIds={postSaves}
          toggleSaved={togglePostSave}
          loading={postsLoading}
          navigate={navigate}
        />
      )}
      {section === "studio" && screen === "post" && (
        <NewPostComposer
          user={user}
          navigate={navigate}
          onPosted={(p) => setPosts((prev) => [p, ...prev])}
        />
      )}
      {section === "studio" && screen === "composer" && (
        <ListWorkComposer
          user={user}
          navigate={navigate}
          onListed={(a) => setArtworks((prev) => [a, ...prev])}
          myArtist={myArtist}
        />
      )}
      {section === "studio" && screen === "saved" && (
        <SavedPage
          artworks={artworks}
          savedIds={savedArtworkIds}
          onUnsave={toggleArtworkSaved}
          navigate={navigate}
        />
      )}
      {section === "studio" && screen === "apply" && (
        <ArtistApply user={user} navigate={navigate} />
      )}
      {section === "studio" && screen === "admin" && (
        <AdminPanel user={user} />
      )}
      {section === "studio" && isRoom && (
        <ArtistRoom artistId={roomId} user={user} myArtist={myArtist} navigate={navigate} />
      )}

      {section === "auth" && (
        <AuthPage mode={(screen as AuthScreen) || "signin"} navigate={navigate} onSignedIn={() => {}} />
      )}

      {!isKnown && (
        <main className="page">
          <div className="notfound">
            <span className="kicker">404</span>
            <h1>Nothing here.</h1>
            <p>The page you're looking for doesn't exist.</p>
            <button className="button" onClick={() => navigate("wall", "grid")}>Back to the Wall</button>
          </div>
        </main>
      )}
    </div>
  );
}