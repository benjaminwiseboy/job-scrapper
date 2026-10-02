#!/bin/sh
# Veille Emploi installer for macOS and Linux: double-click (macOS) or `sh Installer.command`.
cd "$(dirname "$0")" || exit 1

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
  base="https://nodejs.org/dist/$version"
  expected=$(curl -fsSL "$base/SHASUMS256.txt" | awk -v f="$file" '$2 == f { print $1 }')
  [ -n "$expected" ] || return 1
  echo "Téléchargement de Node.js $version..."
  curl -fsSL -o "/tmp/$file" "$base/$file" || return 1
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
node scripts/install.mjs
