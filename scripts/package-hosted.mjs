import { mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const rootDir = resolve('.');
const buildDir = resolve(rootDir, 'build', 'tizen-hosted');
const packageDir = resolve(rootDir, 'build', 'packages');
const outputName = 'arelon-hosted-unsigned.wgt';
const outputPath = resolve(packageDir, outputName);

const PRODUCTION_URL = process.env.VITE_TV_PRODUCTION_URL || 'https://arelon-tv.web.app'; // URL padrão ou informada pelo usuário

async function main() {
  console.log(`▶ Preparando Pacote Hosted App para a Samsung Store`);
  console.log(`📍 URL de Produção: ${PRODUCTION_URL}`);
  console.log('');

  // 1. Limpa e cria pastas
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
  await mkdir(packageDir, { recursive: true });
  await rm(outputPath, { force: true });

  // 2. Cria o config.xml apontando diretamente para a URL do servidor HTTPS
  const configXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://vetraio-tv-z.app/iptv" version="1.0.8" viewmodes="maximized">
  <name>Arelon</name>
  <content src="${PRODUCTION_URL}" />
  <icon src="icon.png" />
  <access origin="*" subdomains="true" />
  <tizen:application id="VetraioApp.Vetraio" package="VetraioApp" required_version="5.5" />
  <tizen:profile name="tv" />
  <feature name="http://tizen.org/feature/screen.size.all" />
  <tizen:privilege name="http://tizen.org/privilege/internet" />
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice" />
  <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" hwkey-event="enable" encryption="disable" install-location="auto" />
</widget>
`;

  await writeFile(resolve(buildDir, 'config.xml'), configXmlContent, 'utf-8');

  // 3. Copia os ícones do app para aparecerem corretos no menu da TV
  const tizenTemplateDir = resolve(rootDir, 'tizen');
  await cp(resolve(tizenTemplateDir, 'icon.png'), resolve(buildDir, 'icon.png'));
  if (existsSync(resolve(tizenTemplateDir, 'icon.svg'))) {
    await cp(resolve(tizenTemplateDir, 'icon.svg'), resolve(buildDir, 'icon.svg'));
  }

  // 4. Cria o pacote .wgt compacto (apenas config.xml + ícones)
  const zip = spawnSync('zip', ['-r', outputPath, '.'], {
    cwd: buildDir,
    stdio: 'inherit',
  });

  if (zip.error) {
    throw new Error('Comando zip não encontrado no Mac. Instale-o para gerar o .wgt.');
  }

  if (zip.status !== 0) {
    throw new Error('Falha ao criar pacote WGT Hosted.');
  }

  console.log('');
  console.log(`✅ Pacote Hosted App Gerado com Sucesso!`);
  console.log(`📦 Arquivo: ${outputPath}`);
  console.log(`🚀 Este é o pacote leve (.wgt de poucos KB) que você irá assinar com o Tizen Studio e enviar para a Samsung Store!`);
}

main().catch((error) => {
  console.error('❌ Falha ao preparar Hosted App:', error.message);
  process.exit(1);
});
