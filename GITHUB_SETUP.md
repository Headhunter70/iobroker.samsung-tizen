# GitHub Setup Anleitung

## Schritt 1: Repository erstellen

1. Gehe zu https://github.com/new
2. Repository-Name: `ioBroker.samsung-tizen`
3. Beschreibung: `ioBroker Adapter for Samsung Tizen TVs`
4. Öffentlich oder Privat wählen
5. **KEIN** README, .gitignore oder Lizenz hinzufügen (haben wir schon)
6. "Create repository" klicken

## Schritt 2: Lokales Git initialisieren

```bash
# Im Projektordner:
cd iobroker-samsung-tizen

git init
git add .
git commit -m "feat: initial release v0.1.0"
git branch -M main
git remote add origin https://github.com/DEIN_GITHUB/ioBroker.samsung-tizen.git
git push -u origin main
```

## Schritt 3: In YOUR_GITHUB ersetzen

Ersetze in allen Dateien `YOUR_GITHUB` durch deinen echten GitHub-Benutzernamen:
- README.md
- package.json
- io-package.json

## Schritt 4: GitHub Actions prüfen

Nach dem Push: Gehe zu → Actions → der CI Workflow sollte automatisch starten.

## Schritt 5: Adapter in ioBroker installieren

```bash
cd /opt/iobroker
npm install https://github.com/DEIN_GITHUB/ioBroker.samsung-tizen
iobroker add samsung-tizen
```

Oder im Admin: Adapter → "Benutzerdefinierte Installation" → GitHub URL eingeben.
