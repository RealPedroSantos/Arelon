import "./MatchMediaRow.css";

type Team = {
  name: string;
  logo: string;
};

type MatchChannel = {
  name: string;
  logo?: string;
  url: string;
};

export type MatchCardItem = {
  id: string;
  category: string;
  categoryLabel: string;
  teamA: Team;
  teamB: Team;
  time: string;
  isLive?: boolean;
  channel: MatchChannel;
};

type Props = {
  title?: string;
  items: MatchCardItem[];
  onOpenChannel?: (item: MatchCardItem) => void;
};

const COUNTRY_FLAGS: Record<string, string> = {
  brasil: "🇧🇷", brazil: "🇧🇷",
  argentina: "🇦🇷",
  uruguai: "🇺🇾", uruguay: "🇺🇾",
  alemanha: "🇩🇪", germany: "🇩🇪",
  espanha: "🇪🇸", spain: "🇪🇸",
  inglaterra: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "grã-bretanha": "🇬🇧", "reino unido": "🇬🇧", uk: "🇬🇧",
  "frança": "🇫🇷", france: "🇫🇷",
  "itália": "🇮🇹", italy: "🇮🇹",
  portugal: "🇵🇹",
  holanda: "🇳🇱", netherlands: "🇳🇱",
  "bélgica": "🇧🇪", belgium: "🇧🇪",
  "croácia": "🇭🇷", croatia: "🇭🇷",
  "suíça": "🇨🇭", switzerland: "🇨🇭",
  dinamarca: "🇩🇰", denmark: "🇩🇰",
  "suécia": "🇸🇪", sweden: "🇸🇪",
  noruega: "🇳🇴", norway: "🇳🇴",
  "polônia": "🇵🇱", poland: "🇵🇱",
  "escócia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "país de gales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  irlanda: "🇮🇪", ireland: "🇮🇪",
  "estados unidos": "🇺🇸", usa: "🇺🇸", eua: "🇺🇸",
  mexico: "🇲🇽", "méxico": "🇲🇽",
  "colômbia": "🇨🇴", colombia: "🇨🇴",
  chile: "🇨🇱",
  peru: "🇵🇪",
  equador: "🇪🇨", ecuador: "🇪🇨",
  "bolívia": "🇧🇴", bolivia: "🇧🇴",
  paraguai: "🇵🇾", paraguay: "🇵🇾",
  venezuela: "🇻🇪",
  "japão": "🇯🇵", japan: "🇯🇵",
  coreia: "🇰🇷", korea: "🇰🇷",
  china: "🇨🇳",
  "austrália": "🇦🇺", australia: "🇦🇺",
  marrocos: "🇲🇦", morocco: "🇲🇦",
  nigeria: "🇳🇬", "nigéria": "🇳🇬",
  egito: "🇪🇬", egypt: "🇪🇬",
  gana: "🇬🇭", ghana: "🇬🇭",
  senegal: "🇸🇳",
  "camarões": "🇨🇲", cameroon: "🇨🇲",
  "costa rica": "🇨🇷",
  "canadá": "🇨🇦", canada: "🇨🇦",
  "arábia saudita": "🇸🇦",
  "irã": "🇮🇷", iran: "🇮🇷",
  turquia: "🇹🇷", turkey: "🇹🇷",
  "grécia": "🇬🇷", greece: "🇬🇷",
  "sérvia": "🇷🇸", serbia: "🇷🇸",
  "república checa": "🇨🇿", czech: "🇨🇿",
  "áustria": "🇦🇹", austria: "🇦🇹",
  hungria: "🇭🇺", hungary: "🇭🇺",
  "romênia": "🇷🇴", romania: "🇷🇴",
  ucrânia: "🇺🇦", ukraine: "🇺🇦",
};

function getTeamDisplay(name: string): { type: "flag" | "initials"; value: string } {
  const lower = name.toLowerCase().trim();
  if (COUNTRY_FLAGS[lower]) return { type: "flag", value: COUNTRY_FLAGS[lower] };
  for (const [key, emoji] of Object.entries(COUNTRY_FLAGS)) {
    if (lower === key || lower.includes(key) || key.includes(lower)) {
      return { type: "flag", value: emoji };
    }
  }
  const words = name.split(/\s+/).filter(Boolean);
  const initials =
    words.length === 1
      ? words[0].slice(0, 3).toUpperCase()
      : words.map((w) => w[0]).slice(0, 3).join("").toUpperCase();
  return { type: "initials", value: initials };
}

function TeamLogo({ team }: { team: Team }) {
  const display = getTeamDisplay(team.name);

  return (
    <div className="match-team-logo-wrap">
      {team.logo ? (
        <div className="match-team-logo-area">
          <img src={team.logo} alt={team.name} className="match-team-logo-img" />
        </div>
      ) : display.type === "flag" ? (
        <div className="match-team-logo-area match-team-logo-area--flag">
          <span className="match-team-flag-emoji">{display.value}</span>
        </div>
      ) : (
        <div className="match-team-logo-area match-team-logo-area--initials">
          <span className="match-team-initials-text">{display.value}</span>
        </div>
      )}
      <span className="match-team-name">{team.name}</span>
    </div>
  );
}

export default function MatchMediaRow({ title = "Jogos de Hoje", items, onOpenChannel }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="match-row-container">
      <h2 className="match-row__title">{title}</h2>
      <div className="match-row__scroll media-row">
        {items.map((item) => (
          <button
            key={item.id}
            className="match-card-btn"
            data-focusable="true"
            onClick={() => onOpenChannel?.(item)}
          >
            <div className="match-card-body">
              {/* Teams section */}
              <div className="match-card-teams">
                <TeamLogo team={item.teamA} />
                <div className="match-card-vs">
                  <span className="match-card-vs-x">x</span>
                </div>
                <TeamLogo team={item.teamB} />
              </div>

              {/* Footer: channel | time */}
              <div className="match-card-meta">
                <div className="match-card-channel">
                  {item.channel.logo && (
                    <img
                      src={item.channel.logo}
                      alt={item.channel.name}
                      className="match-card-channel-logo"
                    />
                  )}
                  <span className="match-card-channel-name">{item.channel.name}</span>
                </div>
                <div className="match-card-divider" />
                <span className="match-card-time">{item.time}</span>
                {item.isLive && (
                  <span className="match-card-live-badge">
                    <span className="match-card-live-dot" />
                    AO VIVO
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export { MatchMediaRow };
