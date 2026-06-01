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
  channel: MatchChannel;
};

type Props = {
  title?: string;
  items: MatchCardItem[];
  onOpenChannel?: (item: MatchCardItem) => void;
};

export default function MatchMediaRow({
  title = "Futebol",
  items,
  onOpenChannel,
}: Props) {
  const handleOpenChannel = (item: MatchCardItem) => {
    if (onOpenChannel) {
      onOpenChannel(item);
    }
  };

  return (
    <section className="match-row-container">
      <h2 className="match-row__title">{title}</h2>

      {/* A classe 'media-row' é crítica para que o sistema de scroll do controle de TV funcione */}
      <div className="match-row__scroll media-row">
        {items.map((item) => {
          return (
            <button
              key={item.id}
              className="media-card media-card--landscape match-card"
              data-focusable="true"
              onClick={() => handleOpenChannel(item)}
            >
              {/* O contêiner interno herda o tamanho 16:9, border-radius e efeitos de escala do app */}
              <div className="media-card-inner match-card-inner">
                {/* Cabeçalho do Card: Categoria e Canal de Transmissão */}
                <div className="match-card-header">
                  <span className="match-category-tag">{item.categoryLabel}</span>
                  <span className="match-separator">•</span>
                  <span className="match-channel-tag">{item.channel.name}</span>
                </div>

                {/* Corpo do Card: Confronto dos Times */}
                <div className="match-card-matchup">
                  <div className={`team-text-wrapper ${item.teamA.name.length > 10 ? 'team-text-wrapper--scrollable' : ''}`}>
                    <span className={`team-text ${item.teamA.name.length > 10 ? 'team-text--scrollable' : ''}`}>
                      {item.teamA.name}
                    </span>
                  </div>
                  <span className="vs-text">vs</span>
                  <div className={`team-text-wrapper ${item.teamB.name.length > 10 ? 'team-text-wrapper--scrollable' : ''}`}>
                    <span className={`team-text ${item.teamB.name.length > 10 ? 'team-text--scrollable' : ''}`}>
                      {item.teamB.name}
                    </span>
                  </div>
                </div>

                {/* Rodapé do Card: Horário e Status Ao Vivo */}
                <div className="match-card-footer-row">
                  <span className="time-badge">{item.time}</span>
                  <span className="live-dot-badge">
                    <span className="dot-pulsate"></span>
                    AO VIVO
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Named export para consistência com outros componentes de Arelon
export { MatchMediaRow };
