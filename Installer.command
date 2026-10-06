#!/bin/sh
# Veille Emploi installer for macOS and Linux: double-click (macOS) or
# `sh Installer.command`. Downloads a release from GitHub, checks its SHA-256,
# then runs the scripts/install.mjs it contains.
#   sh Installer.command           latest release
#   sh Installer.command 1.2.0     that version: roll back, or try a pre-release
# VEILLE_REPO (owner/name) or VEILLE_BASE_URL override the download source.

REPO="${VEILLE_REPO:-benjaminwiseboy/job-scrapper}"
ASSET=veille-emploi.zip
tag="${1:-}"
case "$tag" in
  "") base="https://github.com/$REPO/releases/latest/download"; label="la dernière version" ;;
  v*) base="https://github.com/$REPO/releases/download/$tag"; label="la version $tag" ;;
  *) tag="v$tag"; base="https://github.com/$REPO/releases/download/$tag"; label="la version $tag" ;;
esac
base="${VEILLE_BASE_URL:-$base}"

install_node_macos() {
  if command -v brew >/dev/null 2>&1; then
    brew install node
    return
  fi
  # Official .pkg of the current LTS, checked against nodejs.org's SHASUMS256.txt.
  version=$(curl -fsSL https://nodejs.org/dist/index.json | tr '{' '\n' | grep '"lts":"' | head -n 1 |
    sed 's/.*"version":"\([^"]*\)".*/\1/')
  [ -n "$version" ] || return 1
  file="node-$version.pkg"
  nbase="https://nodejs.org/dist/$version"
  expected=$(curl -fsSL "$nbase/SHASUMS256.txt" | awk -v f="$file" '$2 == f { print $1 }')
  [ -n "$expected" ] || return 1
  echo "Téléchargement de Node.js $version..."
  curl -fsSL -o "/tmp/$file" "$nbase/$file" || return 1
  actual=$(shasum -a 256 "/tmp/$file" | awk '{ print $1 }')
  if [ "$actual" != "$expected" ]; then
    rm -f "/tmp/$file"
    echo "Le fichier téléchargé ne correspond pas à l'empreinte publiée : installation annulée."
    return 1
  fi
  echo "Installation (macOS va demander ton mot de passe)..."
  sudo installer -pkg "/tmp/$file" -target / || return 1
  rm -f "/tmp/$file"
  PATH="/usr/local/bin:$PATH"
}

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1"; else sha256sum "$1"; fi | awk '{ print $1 }'
}

for tool in curl unzip; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Il manque la commande $tool : installe-la, puis relance ce fichier."
    exit 1
  fi
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est introuvable : Veille Emploi en a besoin."
  if [ "$(uname)" = "Darwin" ]; then
    printf "L'installer maintenant depuis nodejs.org (version LTS officielle) ? [O/n] "
    read -r answer
    case "$answer" in
      n|N|non|Non) ;;
      *) install_node_macos ;;
    esac
  else
    echo "Installe-le avec le gestionnaire de paquets de ta distribution, ou depuis https://nodejs.org."
  fi
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Installe Node.js (version LTS) depuis https://nodejs.org puis relance ce fichier."
  exit 1
fi

work=$(mktemp -d) || exit 1
trap 'rm -rf "$work"' EXIT

echo "Téléchargement de $label de Veille Emploi..."
if ! curl -fL --progress-bar -o "$work/$ASSET" "$base/$ASSET" ||
  ! curl -fsSL -o "$work/$ASSET.sha256" "$base/$ASSET.sha256"; then
  echo "Impossible de télécharger $label depuis https://github.com/$REPO/releases"
  echo "Vérifie ta connexion internet, ou le numéro de version demandé."
  exit 1
fi
if [ "$(sha256 "$work/$ASSET")" != "$(awk '{ print $1; exit }' "$work/$ASSET.sha256")" ]; then
  echo "Le fichier téléchargé ne correspond pas à son empreinte SHA-256 : installation annulée."
  exit 1
fi
unzip -q "$work/$ASSET" -d "$work" || exit 1

node "$work/veille-emploi/scripts/install.mjs"
