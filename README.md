# Audit Automation — Agences Créatives B2B

Un formulaire multi-étapes schema-driven pour l'audit d'automatisation des agences créatives B2B, prêt à déployer sur GitHub Pages.

## 🚀 Déploiement rapide

### 1. Cloner le repo
```bash
git clone https://github.com/alpha-nc/audit-agences-creatives.git
cd audit-agences-creatives
```

### 2. Configurer les variables
Modifier `app.js` :
```javascript
const CONFIG = {
  WEBHOOK_PROD: "https://VOTRE-N8N-DOMAIN/webhook/audit-agences-creatives?token=VOTRE-TOKEN",
  // ...
};
```

Modifier `index.html` (CSP) :
```html
connect-src 'self' https://VOTRE-N8N-DOMAIN;
```

### 3. Remplacer les assets
- `assets/logo.png` : Logo de votre agence (44x44px recommandé)
- `assets/favicon.ico` : Favicon de votre site

### 4. Déployer sur GitHub Pages
1. Push vers GitHub
2. Settings → Pages → Source: Deploy from branch (main)
3. Votre formulaire est accessible à `https://votre-username.github.io/audit-agences-creatives/`

## 📁 Structure du projet

```
audit-agences-creatives/
├── index.html                    # Page principale du formulaire
├── styles.css                    # Styles (dark mode, UI moderne)
├── app.js                        # Logique formulaire + validation + API
├── schema.json                   # Configuration du formulaire (source de vérité)
├── politique-confidentialite.html # Page RGPD obligatoire
├── .nojekyll                     # Désactive Jekyll sur GitHub Pages
├── n8n-workflow.json             # Workflow n8n importable (optionnel)
└── assets/
    ├── logo.png                  # Logo (à remplacer)
    └── favicon.ico               # Favicon (à remplacer)
```

## ✨ Fonctionnalités

### Formulaire
- ✅ **7 étapes** : Intro → Agence → Défis → Volume → Outils → Décision → Analyse
- ✅ **Schema-driven** : Tout est configurable via `schema.json`
- ✅ **Validation stricte** : Côté client avec messages d'erreur clairs
- ✅ **Champs conditionnels** : Affichage/masquage dynamique
- ✅ **Autosave localStorage** : Reprise automatique, TTL 30 jours
- ✅ **Honeypot** : Protection anti-spam basique

### UX/UI
- ✅ **Dark mode** : Design moderne avec accents #00E5A8
- ✅ **Responsive** : Mobile-first, sticky bar adaptative
- ✅ **Progress bar** : Indicateur de progression visuel
- ✅ **Accessibilité** : ARIA labels, focus visible

### Intégration
- ✅ **Webhook n8n** : POST JSON vers votre endpoint
- ✅ **Timeout 15s** : Gestion des erreurs réseau
- ✅ **Rate limiting** : Désactivation du bouton si erreur RATE_LIMIT
- ✅ **Analyse iframe** : Rendu sécurisé via `srcdoc` sandboxé

### Mode DEV
- ✅ Activable via `?dev=1`
- ✅ Affiche le payload JSON en temps réel
- ✅ Bouton "Copier JSON" pour debug

## 🔧 Configuration schema.json

Le fichier `schema.json` définit toutes les étapes et champs du formulaire :

```json
{
  "version": "1.0.0",
  "form_tag": "audit-agences-creatives",
  "steps": [
    {
      "id": "agency",
      "page": 2,
      "type": "form",
      "title": "Votre agence",
      "fields": [
        {
          "id": "agency_type",
          "type": "select",
          "label": "Type d'agence",
          "required": true,
          "options": ["Option 1", "Option 2"]
        }
      ]
    }
  ]
}
```

### Types de champs supportés
- `text`, `email`, `tel`, `number`
- `select` (dropdown)
- `radio` (choix unique)
- `checkbox` (case à cocher unique)
- `checkboxes` (choix multiples)
- `range` (slider)

### Champs conditionnels
```json
{
  "id": "other_field",
  "type": "text",
  "required": { "when": { "field": "parent_field", "equals": "Autre" } },
  "showWhen": { "field": "parent_field", "equals": "Autre" }
}
```

## 📡 API Webhook

### Payload envoyé (FORM → n8n)
```json
{
  "meta": {
    "submittedAt": "2026-01-07T12:00:00.000Z",
    "tracking": {
      "sessionId": "uuid-v4",
      "tag": "audit-agences-creatives",
      "params": {
        "utm_source": "...",
        "utm_medium": "...",
        "utm_campaign": "...",
        "ref": "...",
        "variant": "..."
      }
    }
  },
  "answers": {
    "agency_type": "...",
    "team_size": 5,
    // ... tous les champs du formulaire
  }
}
```

### Réponse attendue (n8n → FORM)

**Succès :**
```json
{
  "ok": true,
  "submissionId": "AUD-20260107-0421",
  "analysis_html": "<!doctype html>...",
  "scores": { "priority_tier": "P1" }
}
```

**Erreur :**
```json
{
  "ok": false,
  "error_code": "RATE_LIMIT",
  "message_user": "Trop de tentatives. Réessaie dans quelques minutes.",
  "details": { "retry_after_seconds": 600 }
}
```

## 🔒 Sécurité

### CSP (Content Security Policy)
La balise meta CSP dans `index.html` doit être adaptée :
```html
connect-src 'self' https://votre-n8n.domain.com;
```

### Honeypot
Le champ `hp_field` est masqué. Si rempli → bot détecté (à gérer côté n8n).

### localStorage
- Clé : `audit-agences-creatives:v1`
- TTL : 30 jours
- Purge automatique si version du schema change

## 📝 Workflow n8n

Le fichier `n8n-workflow.json` contient un workflow importable qui :
1. Reçoit le POST du formulaire
2. Valide le token
3. Applique un rate limiting basique
4. Génère une analyse HTML dynamique
5. Renvoie la réponse JSON

### Import dans n8n
1. Dans n8n : **Settings → Import from File**
2. Sélectionner `n8n-workflow.json`
3. Configurer le token dans le node "Validate Token"
4. Activer le workflow

## 📄 RGPD / Confidentialité

La page `politique-confidentialite.html` est conforme RGPD avec :
- Responsable du traitement
- Données collectées
- Finalités
- Base légale
- Durées de conservation
- Droits des utilisateurs
- Mentions localStorage
- Contact CNIL

## 🧪 Test local

```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# Ouvrir avec mode DEV
open http://localhost:8080/?dev=1
```

## 📋 Checklist déploiement

- [ ] Remplacer `<N8N_DOMAIN>` et `<TOKEN>` dans `app.js`
- [ ] Mettre à jour le CSP dans `index.html`
- [ ] Remplacer `assets/logo.png` et `assets/favicon.ico`
- [ ] Vérifier `CONFIG.CALENDLY_URL` dans `app.js`
- [ ] Vérifier `CONFIG.INTERNAL_EMAIL` dans `app.js`
- [ ] Importer et activer le workflow n8n
- [ ] Tester le formulaire complet avec soumission
- [ ] Vérifier la politique de confidentialité

## 📜 Licence

MIT © 2026 Alpha No-Code
