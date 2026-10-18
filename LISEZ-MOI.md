# Nos échappées — Madina & Abdourahman

Application locale PHP, JavaScript et CSS, sans installation de dépendances ni base de données. Compatible PHP 5.5 et versions suivantes. Ouvrir **http://localhost/carnet_voyage/** après avoir démarré Wamp (icône verte).

## Utilisation

- Les onglets Notre carnet, Madina, Abdourahman et À deux filtrent les souvenirs.
- La carte contient les destinations indiquées. Les lieux français proches sont regroupés : cliquer sur le repère puis choisir une ville dans le panneau sous la carte.
- Ajouter un souvenir permet d’enregistrer une photo et/ou une note, son auteur, son lieu et une date facultative. Un nouveau lieu peut être saisi avec des coordonnées facultatives pour le repère sur la carte.
- Cliquer sur une photo pour lire, modifier ou supprimer son souvenir. Le cœur enregistre les favoris.
- Les photos initiales sont attribuées à Abdourahman et peuvent être corrigées. Les dates inconnues restent vides. Le lieu de la soutenance est à compléter. Les repères de destinations n’indiquent pas qu’une photo existe déjà.
- Les fichiers placés directement dans le dossier ne sont pas importés automatiquement : utiliser « Ajouter un souvenir » pour les classer dans le bon carnet.

## Stockage et sauvegarde

Les modifications sont partagées par toutes les personnes qui accèdent au **même serveur**, dans `data/carnet.json`, créé à la première modification. Les photos ajoutées sont dans `uploads/`, celles d’origine dans `assets/`. La sauvegarde JSON depuis le pied de page contient les textes et les chemins des photos ; pour une sauvegarde complète, copier **tout le dossier de l’application**, notamment `data`, `uploads` et `assets`. Pour restaurer, arrêter les écritures puis remettre ces dossiers. Les photos de souvenirs supprimés restent sur disque pour éviter de perdre un original.

Les mises à jour du code ne doivent jamais remplacer `data/carnet.json` ni supprimer `uploads/`. Le fichier `data/seed.json` est seulement le contenu initial.

## Wamp

Les dossiers `data` et `uploads` doivent être accessibles en écriture par Apache. Les règles `.htaccess` protègent les sauvegardes contre l’accès direct par HTTP et interdisent les scripts dans les uploads. `AllowOverride All` doit être activé pour ce dossier, comme sur une installation Wamp habituelle.

Les photos sont limitées à 12 Mo par l’application et aux limites PHP du serveur. Si Wamp refuse une photo, ouvrir son menu PHP → php.ini et régler `upload_max_filesize = 12M` et `post_max_size = 16M`, puis redémarrer les services. Les images HEIC doivent être exportées en JPG avant ajout.

Les contours géographiques sont inclus et la carte fonctionne sans connexion. Les polices Google sont facultatives : des polices système prennent le relais hors connexion. Données géographiques Natural Earth via github.com/johan/world.geo.json (domaine public).

## Accès à distance

Cette première version est un carnet local sans comptes ni mot de passe : les onglets désignent les propriétaires des souvenirs, pas des comptes privés. Toute personne qui accède à l’application peut modifier les deux carnets. Pour l’utiliser ensemble à distance, prévoir un hébergement PHP maintenu, HTTPS, une authentification et des sauvegardes avant publication. Ne pas exposer directement l’ancien PHP 5.5 de Wamp sur Internet. `localhost` depuis un autre appareil désigne cet autre appareil, pas votre ordinateur.

## Vérifications techniques

`php -l api.php` et `php -l index.php` vérifient la syntaxe PHP ; `node --check app.js` vérifie JavaScript. Pour un aperçu indépendant de Wamp : `php -S 127.0.0.1:8765 -t .` depuis le dossier. Le serveur PHP intégré ne lit pas les protections Apache `.htaccess` ; l’utiliser uniquement sur l’interface locale pour le développement.
