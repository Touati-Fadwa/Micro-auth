# Étape 1 : Image de base légère Node.js
FROM node:16-bullseye

# Étape 2 : Dossier de travail
WORKDIR /app

# Étape 3 : Copier les fichiers de dépendances
COPY package*.json ./
RUN npm install

# Étape 4 : Copier tous les fichiers, y compris le dossier src/
COPY . .

# Étape 5 : Exposer le port backend
EXPOSE 3002

# Étape 6 : Commande pour démarrer le backend
CMD ["node", "src/index.js"]
