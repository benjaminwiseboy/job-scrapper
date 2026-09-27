# job-scraper-test

Test de validation : un agent cloud planifié peut-il installer Playwright,
scraper Indeed en headless, et écrire le résultat dans la base d'un Artifact ?

```
npm install
npx playwright install --with-deps chromium
node scripts/scrape-indeed.mjs "acheteur junior" "France"
```

Sortie : un tableau JSON sur stdout, prêt à être écrit via l'outil ArtifactData
(collection `offers`, `doc_id` = champ `docId` de chaque entrée).
