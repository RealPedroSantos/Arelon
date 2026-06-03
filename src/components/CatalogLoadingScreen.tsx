type CatalogLoadingScreenProps = {
  message?: string
}

export function CatalogLoadingScreen({ message = 'Carregando conteúdo...' }: CatalogLoadingScreenProps) {
  return (
    <div className="catalog-loading-screen">
      <img className="catalog-loading-logo" src="assets/arelon/logo-arelon-padrao.png" alt="Arelon" />
      <div className="catalog-loading-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="catalog-loading-message">{message}</div>
    </div>
  )
}
