# Handoff — embed « Salons à connaître »

Nouvel embed d'information listant les salons ressources du serveur, destiné au
salon info (à publier à côté de `Présentation` et `Règlement`).

**Rien n'est commité** : les deux fichiers ci-dessous sont dans l'arbre de travail.

## Fichiers

| État | Fichier | Contenu |
|---|---|---|
| **nouveau** | `src/embeds/ressources.js` | Le builder `buildRessourcesEmbed()` + la liste `GROUPS` des salons |
| modifié | `src/commands/embed.js` | 2 lignes : l'import du builder + l'entrée `ressources` dans le registre `EMBEDS` |

Aucune autre partie du bot n'est touchée : pas de nouvelle dépendance, pas de
colonne en base, pas de variable d'environnement.

## Ce que fait l'embed

Les salons sont référencés **par ID**, sous forme de mentions `<#id>`. Discord
affiche automatiquement le nom actuel du salon : renommer un salon ne casse
jamais l'embed et ne demande aucune modification du code.

Contenu actuel (`src/embeds/ressources.js:13`) :

| Groupe | ID du salon | Description affichée |
|---|---|---|
| 📌 L'essentiel | `1385590356837666866` | Les règles du serveur — à lire en premier. |
| | `1424299961662570617` | Les annonces importantes à ne pas manquer. |
| | `1518648908463739011` | Propose une sortie ou une idée pour améliorer le serveur. |
| 💬 Partage & communauté | `1518600345301942342` | Partage ce que tu veux, pose tes questions. |
| | `1518602555083460748` | Tes plus belles prises : shiny, pépites, 100 %… |
| | `1518601425574297671` | Présente-toi à la communauté. |
| | `1518603710782242816` | Échange ton code ami avec les autres dresseurs. |
| 📖 Tout savoir sur le jeu | `1385589724315652238` | *(liste compacte, description commune au groupe)* |
| | `1385589012219297802` | |
| | `1416012797258502144` | |
| | `1385589578907516958` | |
| 💡 Les petits tips | `1498327577247617156` | Les astuces du quotidien pour progresser plus vite. |

Un item sans `desc` est rendu en mention nue ; un groupe dont **tous** les items
sont sans `desc` bascule en liste compacte (`•` en séparateur) sous la `desc` du
groupe. C'est ce qui produit la mise en forme du groupe « Tout savoir sur le jeu ».

## Déploiement sur le VPS

L'ajout d'un **choix** à la commande `/embed` modifie sa définition côté Discord :
un redéploiement des commandes est nécessaire (une seule fois).

```bash
# récupérer le code (après commit/push depuis le poste de dev)
git pull

# ré-enregistrer les commandes slash sur la guilde
docker compose run --rm bot npm run deploy

# reconstruire et relancer le bot avec le nouveau code
docker compose up -d --build bot
```

Puis, dans le salon info :

```
/embed type:Salons à connaître
```

La commande demande la permission **Gérer le serveur** (`src/commands/embed.js:35`)
et la réponse de confirmation est éphémère ; seul l'embed reste dans le salon.

### Modifications ultérieures

Changer un texte ou un ID dans `GROUPS` **ne touche pas** à la définition de la
commande : un simple `docker compose up -d --build bot` suffit, puis republier
avec `/embed`. `npm run deploy` n'est à relancer que si le nom, la description
ou les choix de `/embed` changent.

Pour retirer un salon : supprimer son entrée dans `GROUPS`. Un groupe vide est
automatiquement omis de l'embed (filtre sur `items.length`).

## Vérifications faites

- Syntaxe des deux fichiers validée (`node --check`).
- Rendu de l'embed contrôlé avec un `EmbedBuilder` bouchonné : 12 salons
  référencés, aucun doublon, 4 champs (limite Discord : 25), aucun champ ne
  dépasse 1024 caractères.
- **Non vérifié** : le bot n'a pas été lancé (ni `.env`, ni `node_modules`, ni
  Docker sur le poste de dev). Le rendu réel dans Discord reste à confirmer.

## À valider côté serveur

1. **Les descriptions sont rédigées d'après les libellés fournis**, pas reprises
   verbatim — relire en particulier « pépites » et « partage ».
2. **Les 4 salons infos/infographies n'ont pas de description individuelle** ;
   ils s'affichent en liste compacte. Pour une ligne par salon avec un texte
   propre, ajouter un champ `desc` à chaque item du groupe.
3. Le groupe « L'essentiel » pointe vers le salon des règles, alors que
   `/embed type:Règlement` publie déjà le règlement complet. Cohérent (l'un
   renvoie vers le salon, l'autre est le contenu), mais à retirer si redondant.
