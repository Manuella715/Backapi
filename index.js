const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
//const {initializeApp}= require("firebase/app");

const { Timestamp } = require("firebase-admin/firestore");

// Initialise Firebase Admin SDK
admin.initializeApp();
//initializeApp(firebaseConfig);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json()); // Parse JSON body

const db = admin.firestore();

//Middleware d'authentification
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant ou invalide" });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await db.collection("utilisateurs").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    req.user = { uid, ...userDoc.data() };

    next(); // on continue vers la route
  } catch (error) {
    console.error("Erreur middleware auth:", error);
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

// Middleware pour vérifier que l'utilisateur a un des rôles autorisés
function roleMiddleware(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: "Rôle utilisateur non défini" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé : rôle non autorisé" });
    }

    next(); // rôle OK, on continue
  };
}


// ✅ Route GET : récupérer tous les menus d’un restaurant
app.get("/menus/:restaurantId", async (req, res) => {
  const restaurantId = req.params.restaurantId;

  try {
    const snapshot = await db.collection("menus")
      .where("restaurantId", "==", restaurantId)
      .get();

    const menus = [];
    snapshot.forEach(doc => {
      menus.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json({ menus });
  } catch (error) {
    console.error("Erreur récupération menus:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

//Route POST :ajouter un nouveau menu
app.post("/menus", authMiddleware,roleMiddleware(["restaurant_admin", "responsable"]), async (req, res) => {
  console.log("Requête reçue : ", req.body);

  // Récupération des données dans le body
  const { nom, prix, categorie, disponible, restaurantId } = req.body;

  // Validation simple des données obligatoires
  if (!nom || !prix || !categorie || restaurantId === undefined) {
    return res.status(400).json({ error: "Données manquantes" });
  }

  // Vérification du rôle de l'utilisateur connecté
  if (!["restaurant_admin", "responsable"].includes(req.user.role)) {
    return res.status(403).json({ error: "Accès refusé : rôle non autorisé" });
  }

  try {
    

    const newMenu = {
      nom,
      prix,
      categorie,
      disponible: disponible ?? true,
      restaurantId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const docRef = await db.collection("menus").add(newMenu);
    res.status(201).json({ message: "Plat ajouté", id: docRef.id });
  } catch (error) {
    console.error("Erreur ajout menu:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});



// ✅ Route POST : Ajouter un restaurant (admin uniquement pour l’instant)
app.post("/restaurants", authMiddleware, async (req, res) => {
  console.log("Requête reçue (ajout restaurant) :", req.body);

  // Vérifier rôle autorisé (exemple : seulement admin)
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Accès refusé : rôle non autorisé" });
  }

  const { nom, adresse, telephone, email, description } = req.body;

  // Vérification des champs obligatoires
  if (!nom || !adresse || !telephone || !email || !description) {
    return res.status(400).json({ error: "Tous les champs sont requis" });
  }

  try {
    const nouveauRestaurant = {
      nom,
      adresse,
      telephone,
      email,
      description,
      createdAt: Timestamp.now()
    };

    const docRef = await db.collection("restaurants").add(nouveauRestaurant);
    res.status(201).json({ message: "Restaurant ajouté avec succès", id: docRef.id });
  } catch (error) {
    console.error("Erreur ajout restaurant:", error);
    res.status(500).json({ error: "Erreur lors de l'ajout du restaurant" });
  }
});




// Route GET : récupérer tous les restaurants
app.get("/restaurants", async (req, res) => {
  try {
    const snapshot = await db.collection("restaurants").get();
    if (snapshot.empty) {
      return res.status(200).json({ restaurants: [] });
    }

    const restaurants = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ restaurants });
  } catch (error) {
    console.error("Erreur récupération restaurants :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});



app.post("/restaurants", async (req, res) => {
  const { nom, adresse, email, telephone, description } = req.body;

  // Validation basique
  if (!nom || !adresse || !email || !telephone) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  try {
    const newRestaurant = {
      nom,
      adresse,
      email,
      telephone,
      description: description || "",
      createdAt: Timestamp.now(),
    };

    const docRef = await db.collection("restaurants").add(newRestaurant);
    res.status(201).json({ message: "Restaurant ajouté", id: docRef.id });
  } catch (error) {
    console.error("Erreur ajout restaurant:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Route POST : créer une commande
app.post("/commandes", async (req, res) => {
  const { restaurantId, utilisateurId, plats, total, statut } = req.body;

  // Validation simple des données reçues
  if (!restaurantId || !utilisateurId || !plats || !Array.isArray(plats) || plats.length === 0 || total === undefined) {
    return res.status(400).json({ error: "Données manquantes ou invalides" });
  }

  try {
   

    const nouvelleCommande = {
      restaurantId,
      utilisateurId,
      plats,
      total,
      statut: statut ?? "en attente",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await db.collection("commandes").add(nouvelleCommande);

    res.status(201).json({ message: "Commande créée avec succès", id: docRef.id });
  } catch (error) {
    console.error("Erreur création commande:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});


// Ajoute authMiddleware comme 2e argument, avant la fonction async
app.post("/commandes", authMiddleware, async (req, res) => {
  const { restaurantId, utilisateurId, plats, total, statut } = req.body;

  // Validation simple des données reçues
  if (!restaurantId || !utilisateurId || !plats || !Array.isArray(plats) || plats.length === 0 || total === undefined) {
    return res.status(400).json({ error: "Données manquantes ou invalides" });
  }

  try {
    // Optionnel : tu peux vérifier que l'utilisateur connecté est bien celui qui passe la commande
    if (utilisateurId !== req.user.uid) {
      return res.status(403).json({ error: "Accès refusé : utilisateur non autorisé" });
    }

    const nouvelleCommande = {
      restaurantId,
      utilisateurId,
      plats,
      total,
      statut: statut ?? "en attente",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await db.collection("commandes").add(nouvelleCommande);

    res.status(201).json({ message: "Commande créée avec succès", id: docRef.id });
  } catch (error) {
    console.error("Erreur création commande:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});




// Route GET : récupérer toutes les commandes d’un restaurant
app.get("/commandes/:restaurantId", async (req, res) => {
  const restaurantId = req.params.restaurantId;

  try {
    const snapshot = await db
      .collection("commandes")
      .where("restaurantId", "==", restaurantId)
      .get();

    const commandes = [];
    snapshot.forEach((doc) => {
      commandes.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json({ commandes });
  } catch (error) {
    console.error("Erreur récupération commandes:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Route PATCH : seul un RESPONSABLE peut changer le statut d'une commande
app.patch("/commandes/:commandeId", authMiddleware,roleMiddleware(["responsable"]), async (req, res) => {
  const commandeId = req.params.commandeId;
  const { statut } = req.body;

  // Validation
  if (!statut || typeof statut !== "string") {
    return res.status(400).json({ error: "Statut manquant ou invalide" });
  }

  try {
   

    // 🔧 Mise à jour du statut
    await db.collection("commandes").doc(commandeId).update({
      statut,
      updatedAt: Timestamp.now(),
    });

    res.status(200).json({ message: "Statut mis à jour avec succès" });
  } catch (error) {
    console.error("Erreur mise à jour commande:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});


// Route GET : récupérer toutes les commandes d’un restaurant
app.get("/commandes/:restaurantId", async (req, res) => {
  const restaurantId = req.params.restaurantId;

  try {
    const snapshot = await db.collection("commandes")
      .where("restaurantId", "==", restaurantId)
      .orderBy("createdAt", "desc")
      .get();

    const commandes = [];
    snapshot.forEach(doc => {
      commandes.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json({ commandes });
  } catch (error) {
    console.error("Erreur récupération commandes:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});


//Route GET: Recuperer les commandes d'un utilisateur specifique
app.get("/commandes/utilisateur/:utilisateurId", authMiddleware, async (req, res) => {
  const utilisateurId = req.params.utilisateurId;
  if (utilisateurId !== req.user.uid) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  try {
    const snapshot = await db.collection("commandes")
      .where("utilisateurId", "==", utilisateurId)
      .orderBy("createdAt", "desc")
      .get();

    const commandes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ commandes });
  } catch (error) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});



//application mobile
const { getAuth } = require("firebase-admin/auth");


// Route POST : inscription utilisateur
app.post("/auth/signup", async (req, res) => {
  const { email, password, nom, prenom, telephone, role } = req.body;

  // Validation simple
  if (!email || !password || !nom || !prenom || !telephone) {
    return res.status(400).json({ error: "Tous les champs obligatoires doivent être remplis" });
  }

  try {
    // Créer l'utilisateur dans Firebase Auth
    const userRecord = await getAuth().createUser({
      email,
      password,
      displayName: `${prenom} ${nom}`,
      phoneNumber: telephone, // format international, ex: +2376xxxxxxx
      emailVerified: false,
    });

    // Créer un document utilisateur dans Firestore avec Timestamp.now()
    await db.collection("utilisateurs").doc(userRecord.uid).set({
      email,
      nom,
      prenom,
      telephone,
      role: role || "client",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    res.status(201).json({ message: "Utilisateur créé avec succès", uid: userRecord.uid });

  } catch (error) {
    console.error("Erreur inscription:", error);
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ error: "Cet email est déjà utilisé" });
    }
    if (error.code === "auth/phone-number-already-exists") {
      return res.status(400).json({ error: "Ce numéro de téléphone est déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur serveur lors de la création de l'utilisateur" });
  }
});

//Route post : Connexion utilisateur

app.post('/auth/signin', async (req, res) => {
  const { email, password } = req.body;

  // Validation simple
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  try {
    // Firebase Admin SDK ne gère pas directement la connexion avec email+password,
    // il faut utiliser Firebase Client SDK côté frontend pour ça.
    // Mais ici on simule une connexion backend pour validation avec Firebase Auth REST API (option avancée).
    // Pour simplifier, on peut vérifier que l'utilisateur existe :

    const userRecord = await getAuth().getUserByEmail(email);

    if (!userRecord) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    // IMPORTANT : La vérification du mot de passe doit se faire côté client (Firebase Client SDK)
    // Sinon, côté backend, il faut utiliser l’API REST Firebase Auth (avec token d’API)
    // Sinon tu peux gérer une authentification custom (hors Firebase Auth standard)

    // Ici, pour l'exemple, on retourne le userRecord si trouvé
    res.status(200).json({ message: 'Connexion réussie', uid: userRecord.uid });

  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
});

//application web


// Route POST : créer un responsable de restaurant (admin uniquement)
app.post("/admin/creer-responsable", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  // Seul un admin peut créer un responsable
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Accès refusé : rôle non autorisé" });
  }

  const { email, password, nom, prenom, telephone, restaurantId } = req.body;

  // 🔒 Vérification simple des champs
  if (!email || !password || !nom || !prenom || !telephone || !restaurantId) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  try {
    // Création utilisateur Firebase Auth
    const userRecord = await getAuth().createUser({
      email,
      password,
      displayName: `${prenom} ${nom}`,
      phoneNumber: telephone,
      emailVerified: false,
    });

    // Création profil Firestore
    await db.collection("utilisateurs").doc(userRecord.uid).set({
      email,
      nom,
      prenom,
      telephone,
      role: "responsable",
      restaurantId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    res.status(201).json({
      message: "Responsable créé avec succès",
      uid: userRecord.uid,
    });
  } catch (error) {
    console.error("Erreur création responsable:", error);
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ error: "Cet email est déjà utilisé" });
    }
    if (error.code === "auth/phone-number-already-exists") {
      return res.status(400).json({ error: "Ce numéro de téléphone est déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur serveur" });
  }
});



// Route POST : Créer restaurant + responsable en une fois (admin uniquement)
app.post("/admin/ajouter-restaurant-et-responsable", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  const { nomRestaurant, adresse, responsableNom, responsablePrenom, responsableEmail, responsablePassword, telephone } = req.body;

  if (!nomRestaurant || !adresse || !responsableNom || !responsablePrenom || !responsableEmail || !responsablePassword || !telephone) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  try {
    // ✅ 1. Créer le user responsable
    const userRecord = await getAuth().createUser({
      email: responsableEmail,
      password: responsablePassword,
      displayName: `${responsablePrenom} ${responsableNom}`,
      phoneNumber: telephone,
      emailVerified: false,
    });

    // ✅ 2. Ajouter le restaurant
    const restaurantDoc = await db.collection("restaurants").add({
      nom: nomRestaurant,
      adresse,
      responsableNom: `${responsablePrenom} ${responsableNom}`,
      emailResponsable: responsableEmail,
      responsableId: userRecord.uid,
      createdAt: Timestamp.now(),
    });

    // ✅ 3. Ajouter le doc utilisateur lié
    await db.collection("utilisateurs").doc(userRecord.uid).set({
      nom: responsableNom,
      prenom: responsablePrenom,
      email: responsableEmail,
      telephone,
      role: "responsable",
      restaurantId: restaurantDoc.id,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    res.status(201).json({ 
      message: "Restaurant et responsable créés avec succès", 
      restaurantId: restaurantDoc.id,
      responsableUid: userRecord.uid
    });

  } catch (error) {
    console.error("Erreur création restaurant et responsable :", error);
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ error: "Cet email est déjà utilisé" });
    }
    if (error.code === "auth/phone-number-already-exists") {
      return res.status(400).json({ error: "Ce numéro est déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur serveur" });
  }
});






// PATCH /auth/profil (responsable connecté)
app.patch("/auth/profil", authMiddleware, async (req, res) => {
  const { nom, prenom, telephone, email, password } = req.body;

  try {
    const uid = req.user.uid;

    const updates = {};
    if (nom) updates.nom = nom;
    if (prenom) updates.prenom = prenom;
    if (telephone) updates.telephone = telephone;
    if (email) updates.email = email;

    // 🔄 1. Mise à jour Firestore
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = Timestamp.now();
      await db.collection("utilisateurs").doc(uid).update(updates);
    }

    // 🔒 2. Mise à jour Auth
    const authUpdates = {};
    if (nom && prenom) authUpdates.displayName = `${prenom} ${nom}`;
    if (telephone) authUpdates.phoneNumber = telephone;
    if (email) authUpdates.email = email;
    if (password) authUpdates.password = password;

    if (Object.keys(authUpdates).length > 0) {
      await getAuth().updateUser(uid, authUpdates);
    }

    res.status(200).json({ message: "Profil mis à jour avec succès" });

  } catch (error) {
    console.error("Erreur mise à jour profil :", error);
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ error: "Cet email est déjà utilisé" });
    }
    if (error.code === "auth/phone-number-already-exists") {
      return res.status(400).json({ error: "Ce numéro est déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur lors de la mise à jour du profil" });
  }
});




module.exports = app;

