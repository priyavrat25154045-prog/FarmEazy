
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database paths ----------

const databaseFolder = path.join(__dirname, "database");
const databasePath = path.join(databaseFolder, "farmeazy.sqlite");

if (!fs.existsSync(databaseFolder)) {
  fs.mkdirSync(databaseFolder, { recursive: true });
}

let db;

// ---------- Middleware ----------

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

// IMPORTANT: Session middleware must be registered BEFORE routes.
const sessionSecret =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

app.use(
  session({
    name: "farmeazy.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

// ---------- Database helpers ----------

function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(databasePath, Buffer.from(data));
}

function getOne(sql, params = []) {
  const statement = db.prepare(sql);

  try {
    statement.bind(params);

    if (statement.step()) {
      return statement.getAsObject();
    }

    return null;
  } finally {
    statement.free();
  }
}

function getAll(sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];

  try {
    statement.bind(params);

    while (statement.step()) {
      rows.push(statement.getAsObject());
    }

    return rows;
  } finally {
    statement.free();
  }
}

function execute(sql, params = []) {
  db.run(sql, params);
  const result = getOne("SELECT last_insert_rowid() AS id");
  saveDatabase();
  return result;
}

// ---------- Validation helpers ----------

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validUsername(username) {
  return /^[a-zA-Z0-9_.-]{3,30}$/.test(username);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role || "farmer",
    phone: user.phone || ""
  };
}

// ==========================================
// 1. DUAL-ROLE AUTHENTICATION (FARMER & OWNER/DRIVER)
// ==========================================

// ---------- Register ----------

app.post("/api/register", async (req, res) => {
  try {
    const name = cleanText(req.body.name);
    const username = cleanText(req.body.username);
    const email = cleanText(req.body.email).toLowerCase();
    const phone = cleanText(req.body.phone);
    const role = cleanText(req.body.role) === "owner" ? "owner" : "farmer";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        message: "Name must be between 2 and 80 characters."
      });
    }

    if (!validUsername(username)) {
      return res.status(400).json({
        message: "Username must be 3-30 characters using letters, numbers, dots, underscores or hyphens."
      });
    }

    if (!validEmail(email) || email.length > 254) {
      return res.status(400).json({
        message: "Please enter a valid email address."
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: "Password must be between 8 and 72 characters."
      });
    }

    const existingUser = getOne(
      `SELECT id FROM users
       WHERE username = ? COLLATE NOCASE
          OR email = ? COLLATE NOCASE`,
      [username, email]
    );

    if (existingUser) {
      return res.status(409).json({
        message: "Username or email is already registered. Please log in or use different details."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = execute(
      `INSERT INTO users (name, username, email, phone, role, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, username, email, phone, role, passwordHash]
    );

    const user = getOne(
      `SELECT id, name, username, email, phone, role
       FROM users WHERE id = ?`,
      [result.id]
    );

    req.session.regenerate((error) => {
      if (error) {
        console.error("Session error:", error);
        return res.status(500).json({
          message: "Account created, but sign-in failed. Please log in."
        });
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save error:", saveError);
          return res.status(500).json({
            message: "Account created, but sign-in failed. Please log in."
          });
        }

        return res.status(201).json({
          message: role === "owner" 
            ? "Tractor/Machinery Owner account created successfully!" 
            : "Farmer account created successfully!",
          user: publicUser(user)
        });
      });
    });
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      return res.status(409).json({
        message: "Username or email is already registered."
      });
    }

    console.error("Registration error:", error);

    return res.status(500).json({
      message: "Could not register. Please try again."
    });
  }
});

// ---------- Login ----------

app.post("/api/login", async (req, res) => {
  try {
    const usernameOrEmail = cleanText(req.body.usernameOrEmail);
    const requestedRole = cleanText(req.body.role); // 'farmer' or 'owner' (optional filter)
    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (!usernameOrEmail || !password) {
      return res.status(400).json({
        message: "Please enter your username/email and password."
      });
    }

    let sql = `SELECT id, name, username, email, phone, role, password_hash
       FROM users
       WHERE (username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE)`;
    const params = [usernameOrEmail, usernameOrEmail.toLowerCase()];

    if (requestedRole && (requestedRole === "farmer" || requestedRole === "owner")) {
      sql += " AND role = ?";
      params.push(requestedRole);
    }

    sql += " LIMIT 1";

    const user = getOne(sql, params);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        message: requestedRole
          ? `Invalid credentials for ${requestedRole === "owner" ? "Tractor/Machinery Partner" : "Farmer"} portal.`
          : "Invalid username/email or password."
      });
    }

    req.session.regenerate((error) => {
      if (error) {
        console.error("Session error:", error);
        return res.status(500).json({
          message: "Login failed. Please try again."
        });
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save error:", saveError);
          return res.status(500).json({
            message: "Login failed. Please try again."
          });
        }

        return res.json({
          message: `Welcome back, ${user.name}!`,
          user: publicUser(user)
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Could not log in. Please try again."
    });
  }
});

// ---------- Current logged-in user ----------

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      loggedIn: false,
      user: null
    });
  }

  const user = getOne(
    `SELECT id, name, username, email, phone, role
     FROM users WHERE id = ?`,
    [req.session.userId]
  );

  if (!user) {
    return req.session.destroy(() => {
      res.json({
        loggedIn: false,
        user: null
      });
    });
  }

  return res.json({
    loggedIn: true,
    user: publicUser(user)
  });
});

// ---------- Logout ----------

app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);
      return res.status(500).json({
        message: "Could not log out. Please try again."
      });
    }

    res.clearCookie("farmeazy.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    return res.json({
      message: "Logged out successfully."
    });
  });
});

// ==========================================
// 2. MACHINERY & FLEET ROUTES
// ==========================================

// Get all machinery
app.get("/api/machinery", (req, res) => {
  try {
    const category = cleanText(req.query.category);
    const search = cleanText(req.query.search).toLowerCase();
    const ownerId = req.query.ownerId ? parseInt(req.query.ownerId, 10) : null;

    let sql = "SELECT * FROM machinery WHERE 1=1";
    const params = [];

    if (category && category !== "all") {
      sql += " AND category = ?";
      params.push(category);
    }

    if (ownerId) {
      sql += " AND owner_id = ?";
      params.push(ownerId);
    }

    if (search) {
      sql += " AND (LOWER(name) LIKE ? OR LOWER(brand) LIKE ? OR LOWER(location) LIKE ? OR LOWER(tags) LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    sql += " ORDER BY created_at DESC, id ASC";
    const rawItems = getAll(sql, params);

    const items = rawItems.map((item) => ({
      ...item,
      withDriverAvailable: Boolean(item.with_driver_available),
      tags: item.tags ? JSON.parse(item.tags) : []
    }));

    return res.json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (error) {
    console.error("Error fetching machinery:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load machinery fleet."
    });
  }
});

// Add new tractor/machinery (For Owners & Drivers)
app.post("/api/machinery", (req, res) => {
  try {
    const name = cleanText(req.body.name);
    const category = cleanText(req.body.category) || "tractor";
    const brand = cleanText(req.body.brand) || "Generic";
    const hp = cleanText(req.body.hp) || "45 HP";
    const ratePerHour = parseInt(req.body.ratePerHour, 10) || 700;
    const ratePerDay = parseInt(req.body.ratePerDay, 10) || (ratePerHour * 7.5);
    const driverChargePerHour = parseInt(req.body.driverChargePerHour, 10) || 0;
    const location = cleanText(req.body.location);
    const specs = cleanText(req.body.specs) || `${hp} • Heavy Duty Farming Engine`;
    const withDriver = req.body.withDriver ? 1 : 0;
    const ownerId = req.session && req.session.userId ? req.session.userId : null;

    if (!name || !location) {
      return res.status(400).json({
        success: false,
        message: "Please enter machinery name and your location."
      });
    }

    const icons = {
      tractor: "🚜",
      harvester: "🌾",
      tillage: "🌱",
      leveler: "📐",
      seeder: "🌾",
      sprayer: "💧"
    };

    const icon = icons[category] || "🚜";
    const newId = "cust-" + Date.now();
    const defaultTags = JSON.stringify(["Owner Listed", "Verified Machine", "Instant Booking"]);

    execute(
      `INSERT INTO machinery 
      (id, owner_id, name, category, brand, hp, icon, rate_per_hour, rate_per_day, driver_charge_per_hour, location, distance_km, rating, reviews_count, tags, specs, with_driver_available)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.5, 5.0, 1, ?, ?, ?)`,
      [
        newId,
        ownerId,
        name,
        category,
        brand,
        hp,
        icon,
        ratePerHour,
        ratePerDay,
        driverChargePerHour,
        location,
        defaultTags,
        specs,
        withDriver
      ]
    );

    const saved = getOne("SELECT * FROM machinery WHERE id = ?", [newId]);

    return res.status(201).json({
      success: true,
      message: "🎉 Your tractor / machine has been successfully added to FarmEazy live marketplace!",
      machinery: {
        ...saved,
        withDriverAvailable: Boolean(saved.with_driver_available),
        tags: JSON.parse(saved.tags)
      }
    });
  } catch (err) {
    console.error("Add machinery error:", err);
    return res.status(500).json({
      success: false,
      message: "Could not add machinery: " + err.message
    });
  }
});

// ==========================================
// 3. BOOKINGS API ROUTES
// ==========================================

// Create a new booking
app.post("/api/bookings", (req, res) => {
  try {
    const machineryId = cleanText(req.body.machineryId);
    const machineryName = cleanText(req.body.machineryName);
    const farmerLocation = cleanText(req.body.farmerLocation);
    const farmerPhone = cleanText(req.body.farmerPhone);
    const bookingDate = cleanText(req.body.bookingDate);
    const bookingTime = cleanText(req.body.bookingTime);
    const planType = cleanText(req.body.planType) || "hours";
    const durationCount = parseInt(req.body.durationCount, 10) || 1;
    const workType = cleanText(req.body.workType) || "General Farming";
    const withDriver = req.body.withDriver ? 1 : 0;
    const totalAmount = cleanText(req.body.totalAmount);
    const userId = req.session && req.session.userId ? req.session.userId : null;

    if (!machineryName || !farmerLocation || !farmerPhone || !bookingDate || !bookingTime) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required booking details (Location, Phone, Date, Time)."
      });
    }

    if (!/^[0-9]{10}$/.test(farmerPhone)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 10-digit mobile number."
      });
    }

    const bookingCode = "FE-" + Math.floor(100000 + Math.random() * 900000);

    const result = execute(
      `INSERT INTO bookings 
      (booking_code, user_id, machinery_id, machinery_name, farmer_location, farmer_phone, booking_date, booking_time, plan_type, duration_count, work_type, with_driver, total_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed')`,
      [
        bookingCode,
        userId,
        machineryId,
        machineryName,
        farmerLocation,
        farmerPhone,
        bookingDate,
        bookingTime,
        planType,
        durationCount,
        workType,
        withDriver,
        totalAmount
      ]
    );

    const savedBooking = getOne("SELECT * FROM bookings WHERE id = ?", [result.id]);

    return res.status(201).json({
      success: true,
      message: "Machinery reservation confirmed successfully!",
      booking: savedBooking
    });
  } catch (error) {
    console.error("Booking creation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process booking. Please try again."
    });
  }
});

// Get user bookings or recent bookings
app.get("/api/bookings", (req, res) => {
  try {
    let sql = "SELECT * FROM bookings";
    const params = [];

    if (req.session && req.session.userId) {
      // If owner, show orders for their machines; if farmer, show their orders
      const user = getOne("SELECT role FROM users WHERE id = ?", [req.session.userId]);
      if (user && user.role === "farmer") {
        sql += " WHERE user_id = ?";
        params.push(req.session.userId);
      }
    }

    sql += " ORDER BY id DESC LIMIT 20";
    const bookings = getAll(sql, params);

    return res.json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not retrieve bookings."
    });
  }
});

// Update booking status (Driver / Owner can Accept, Start Job, Complete, or Cancel)
app.patch("/api/bookings/:id/status", (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const newStatus = cleanText(req.body.status);
    const validStatuses = ["Confirmed", "Accepted", "On The Way", "Work In Progress", "Completed", "Cancelled"];

    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ success: false, message: "Invalid status value." });
    }

    const booking = getOne("SELECT * FROM bookings WHERE id = ?", [bookingId]);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found." });
    }

    execute("UPDATE bookings SET status = ? WHERE id = ?", [newStatus, bookingId]);
    saveDatabase();

    const updated = getOne("SELECT * FROM bookings WHERE id = ?", [bookingId]);
    return res.json({
      success: true,
      message: `Booking #${updated.booking_code} status updated to '${newStatus}'!`,
      booking: updated
    });
  } catch (error) {
    console.error("Booking status update error:", error);
    return res.status(500).json({ success: false, message: "Could not update booking status." });
  }
});

// ==========================================
// 4. MANDI PRICE & WEATHER ADVISORY API
// ==========================================
app.get("/api/agri-intelligence", (req, res) => {
  try {
    const mandiRates = [
      { crop: "Wheat (गेहूं)", mandi: "Karnal Mandi", state: "Haryana", minPrice: 2275, maxPrice: 2420, modalPrice: 2350, unit: "₹/Quintal", trend: "up", change: "+₹35" },
      { crop: "Paddy Basmati (धान)", mandi: "Amritsar Mandi", state: "Punjab", minPrice: 3800, maxPrice: 4250, modalPrice: 4100, unit: "₹/Quintal", trend: "up", change: "+₹80" },
      { crop: "Mustard (सरसों)", mandi: "Alwar Mandi", state: "Rajasthan", minPrice: 5100, maxPrice: 5450, modalPrice: 5320, unit: "₹/Quintal", trend: "down", change: "-₹40" },
      { crop: "Potato (आलू)", mandi: "Agra Mandi", state: "Uttar Pradesh", minPrice: 1100, maxPrice: 1350, modalPrice: 1250, unit: "₹/Quintal", trend: "stable", change: "₹0" },
      { crop: "Sugarcane (गन्ना)", mandi: "Meerut Mandi", state: "Uttar Pradesh", minPrice: 350, maxPrice: 375, modalPrice: 365, unit: "₹/Quintal", trend: "up", change: "+₹15" },
      { crop: "Soybean (सोयाबीन)", mandi: "Indore Mandi", state: "Madhya Pradesh", minPrice: 4400, maxPrice: 4800, modalPrice: 4620, unit: "₹/Quintal", trend: "up", change: "+₹50" }
    ];

    const weatherForecast = {
      location: "Northern Agri-Belt (Punjab, Haryana, West UP)",
      temperature: "28°C",
      condition: "Partly Sunny / Clear Skies ☀️",
      humidity: "42%",
      windSpeed: "12 km/h",
      rainChance: "8%",
      soilMoisture: "Optimal for Ploughing",
      advisoryAlert: "🟢 IDEAL WEATHER: Soil moisture and low rain chance make today excellent for laser land leveling, rotary tilling and combine harvesting."
    };

    return res.json({
      success: true,
      lastUpdated: new Date().toLocaleTimeString(),
      weather: weatherForecast,
      mandi: mandiRates
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load mandi rates." });
  }
});

// ==========================================
// 5. COMMUNITY MACHINERY POOLING (UBER POOL FOR FARMS)
// ==========================================
app.get("/api/pools", (req, res) => {
  try {
    const activePools = [
      {
        id: "pool-101",
        title: "Combine Harvester Cluster - Taraori Village",
        workType: "Paddy Harvesting (धान कटाई)",
        machine: "John Deere W70 Harvester",
        totalSlots: 4,
        filledSlots: 3,
        farmersJoined: ["Satnam Singh (4 Acres)", "Joginder Kumar (6 Acres)", "Baldev Ram (5 Acres)"],
        perAcreDiscountRate: "₹1,150 / Acre",
        standardRate: "₹1,500 / Acre",
        savingsPercent: "23% OFF",
        targetDate: "Tomorrow Morning (6:00 AM)",
        village: "Taraori, Karnal (Within 3 KM)",
        status: "Filling Fast (1 Spot Left)"
      },
      {
        id: "pool-102",
        title: "Laser Land Leveling Group - Nilokheri Sector",
        workType: "Laser Land Leveling (समतलीकरण)",
        machine: "Swaraj 855 FE + Dual Transmitter Laser",
        totalSlots: 3,
        filledSlots: 1,
        farmersJoined: ["Harpreet Virk (8 Acres)"],
        perAcreDiscountRate: "₹720 / Acre",
        standardRate: "₹950 / Acre",
        savingsPercent: "24% OFF",
        targetDate: "Day After Tomorrow",
        village: "Nilokheri, Karnal (Within 5 KM)",
        status: "Open for 2 Farmers"
      },
      {
        id: "pool-103",
        title: "Heavy Rotavator Tillage Pool - Samalkha",
        workType: "Rotavator Field Preparation (जुताई)",
        machine: "Mahindra 575 DI + Shaktiman 7ft Rotavator",
        totalSlots: 4,
        filledSlots: 2,
        farmersJoined: ["Rameshwar Dayal (3 Acres)", "Vikas Sharma (4.5 Acres)"],
        perAcreDiscountRate: "₹650 / Acre",
        standardRate: "₹850 / Acre",
        savingsPercent: "24% OFF",
        targetDate: "This Saturday",
        village: "Samalkha, Panipat (Within 4 KM)",
        status: "Open for 2 Farmers"
      }
    ];

    return res.json({ success: true, count: activePools.length, data: activePools });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load pools." });
  }
});

// Join a machine pool
app.post("/api/pools/:id/join", (req, res) => {
  try {
    const poolId = req.params.id;
    const farmerName = cleanText(req.body.name) || "Local Farmer";
    const farmArea = cleanText(req.body.acreage) || "4 Acres";

    return res.json({
      success: true,
      message: `🎉 Great! You have successfully joined Pool #${poolId} for ${farmArea}. The operator will coordinate timing with all neighbor farmers to deliver maximum discount!`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not join pool." });
  }
});

// ==========================================
// 6. AI CROP DOCTOR & MACHINERY RECOMMENDATION API
// ==========================================
app.post("/api/crop-doctor", (req, res) => {
  try {
    const crop = cleanText(req.body.crop).toLowerCase();
    const symptom = cleanText(req.body.symptom).toLowerCase();

    const diagnosisKnowledge = {
      yellow: {
        disease: "Nitrogen Deficiency / Yellow Rust (पीला रतुआ)",
        severity: "Moderate",
        treatment: "Foliar spray of Propiconazole 25% EC (1ml/L) or 2% Urea solution spray.",
        recommendedMachine: "Tractor-Mounted 500L Boom Sprayer (50-60 HP)",
        benefit: "Even droplet distribution covers 5 acres in just 45 minutes without crop trampling."
      },
      pest: {
        disease: "Stem Borer / Armyworm Attack (तना छेदक कीट)",
        severity: "High",
        treatment: "Spray Chlorantraniliprole 18.5% SC (0.4 ml/L) in early morning or evening.",
        recommendedMachine: "Agri-Drone Sprayer / High Clearance Mist Blower",
        benefit: "Ultra-fine mist reaches underside of dense crop leaves with 90% water saving."
      },
      weeds: {
        disease: "Phalaris Minor (गुल्ली डंडा) & Broadleaf Weeds",
        severity: "Moderate",
        treatment: "Post-emergence Clodinafop-propargyl or Metribuzin at 30-35 DAS.",
        recommendedMachine: "Zero-Till Happy Seeder / Precision Boom Sprayer",
        benefit: "Targeted nozzle spraying prevents soil compaction."
      },
      harvest: {
        disease: "Over-Matured Grain Shatering Risk (फसल पकने का समय)",
        severity: "Time Sensitive",
        treatment: "Harvest within 3-4 days at 18-20% grain moisture to prevent pod drop.",
        recommendedMachine: "Multi-Crop Combine Harvester (Claas / John Deere)",
        benefit: "Clean grain threshing with less than 0.5% cutter loss."
      }
    };

    let result = diagnosisKnowledge.yellow;
    if (symptom.includes("pest") || symptom.includes("insect") || symptom.includes("कीड़ा") || symptom.includes("worm")) {
      result = diagnosisKnowledge.pest;
    } else if (symptom.includes("weed") || symptom.includes("घास") || symptom.includes("खरपतवार")) {
      result = diagnosisKnowledge.weeds;
    } else if (symptom.includes("ripe") || symptom.includes("कटाई") || symptom.includes("harvest") || symptom.includes("shatter")) {
      result = diagnosisKnowledge.harvest;
    }

    return res.json({
      success: true,
      crop: req.body.crop || "Wheat",
      diagnosis: result
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "AI Diagnosis failed." });
  }
});

// Direct Download Presentation Route
app.get("/download-presentation", (req, res) => {
  const filePath = path.join(__dirname, "FarmEazy_Presentation.pdf");
  if (fs.existsSync(filePath)) {
    return res.download(filePath, "FarmEazy_Presentation.pdf");
  } else {
    return res.status(404).send("Presentation PDF not found.");
  }
});

// ---------- Static files ----------

// Never expose the database folder publicly.
app.use("/database", (req, res) => {
  res.sendStatus(404);
});

app.use(express.static(__dirname));

// ---------- Seed Default Machinery Fleet ----------

function seedMachineryIfEmpty() {
  const countObj = getOne("SELECT COUNT(*) AS total FROM machinery");
  if (countObj && countObj.total > 0) return;

  console.log("Seeding initial FarmEazy tractor and machinery fleet into SQLite database...");

  const initialFleet = [
    {
      id: "tr-1",
      name: "Mahindra 575 DI XP Plus",
      category: "tractor",
      brand: "Mahindra",
      hp: "47 HP",
      icon: "🚜",
      rate_per_hour: 700,
      rate_per_day: 5200,
      driver_charge_per_hour: 100,
      location: "Sonipat, Haryana (2.4 km away)",
      distance_km: 2.4,
      rating: 4.9,
      reviews_count: 38,
      tags: JSON.stringify(["High Mileage", "Rotavator Ready", "Fuel Efficient"]),
      specs: "4-Cylinder ELS DI Engine • 2000 kg Hydraulics • Dual Clutch",
      with_driver_available: 1
    },
    {
      id: "tr-2",
      name: "Swaraj 744 FE",
      category: "tractor",
      brand: "Swaraj",
      hp: "48 HP",
      icon: "🚜",
      rate_per_hour: 750,
      rate_per_day: 5500,
      driver_charge_per_hour: 100,
      location: "Karnal, Haryana (4.1 km away)",
      distance_km: 4.1,
      rating: 4.8,
      reviews_count: 42,
      tags: JSON.stringify(["Power Steering", "Heavy Duty", "Popular"]),
      specs: "3-Cylinder Water Cooled • Multi-speed Reverse PTO • Oil Immersed Brakes",
      with_driver_available: 1
    },
    {
      id: "tr-3",
      name: "John Deere 5310 PowerTech",
      category: "tractor",
      brand: "John Deere",
      hp: "55 HP",
      icon: "🚜",
      rate_per_hour: 900,
      rate_per_day: 6800,
      driver_charge_per_hour: 120,
      location: "Panipat, Haryana (5.2 km away)",
      distance_km: 5.2,
      rating: 4.9,
      reviews_count: 56,
      tags: JSON.stringify(["Turbo Charged", "Heavy Implements", "AC Cabin Available"]),
      specs: "3-Cylinder Turbocharged • Top Shaft Synchromesh • 2000 kg Lift",
      with_driver_available: 1
    },
    {
      id: "tr-4",
      name: "Massey Ferguson 241 DI Maha Shakti",
      category: "tractor",
      brand: "Massey Ferguson",
      hp: "42 HP",
      icon: "🚜",
      rate_per_hour: 680,
      rate_per_day: 4900,
      driver_charge_per_hour: 90,
      location: "Meerut, Uttar Pradesh (3.0 km away)",
      distance_km: 3.0,
      rating: 4.8,
      reviews_count: 31,
      tags: JSON.stringify(["Best Pulling Power", "Smooth Gearbox", "Trolley & Haulage"]),
      specs: "SIMPSONS 3-Cyl Engine • Planetary Plus Axle • Quick Hydraulic Response",
      with_driver_available: 1
    },
    {
      id: "tr-5",
      name: "Powertrac Euro 50 Next",
      category: "tractor",
      brand: "Powertrac",
      hp: "52 HP",
      icon: "🚜",
      rate_per_hour: 780,
      rate_per_day: 5700,
      driver_charge_per_hour: 100,
      location: "Aligarh, Uttar Pradesh (6.5 km away)",
      distance_km: 6.5,
      rating: 4.7,
      reviews_count: 27,
      tags: JSON.stringify(["Dual Clutch", "Diesel Saver", "Modern Styling"]),
      specs: "3-Cyl AVL Technology • High Torque • Balanced Power Steering",
      with_driver_available: 1
    },
    {
      id: "tr-6",
      name: "Sonalika Tiger DI 55",
      category: "tractor",
      brand: "Sonalika",
      hp: "55 HP",
      icon: "🚜",
      rate_per_hour: 850,
      rate_per_day: 6200,
      driver_charge_per_hour: 110,
      location: "Rohtak, Haryana (4.8 km away)",
      distance_km: 4.8,
      rating: 4.8,
      reviews_count: 35,
      tags: JSON.stringify(["CRDS Tech", "High Speed PTO", "Tough Terrain"]),
      specs: "4-Cyl HDM Engine • 12F + 12R Shuttle Shift • 2200 kg Lifting",
      with_driver_available: 1
    },
    {
      id: "mc-1",
      name: "Preet 987 Self Propelled Combine Harvester",
      category: "harvester",
      brand: "Preet",
      hp: "101 HP",
      icon: "🌾",
      rate_per_hour: 2200,
      rate_per_day: 16500,
      driver_charge_per_hour: 250,
      location: "Ludhiana, Punjab (7.8 km away)",
      distance_km: 7.8,
      rating: 4.9,
      reviews_count: 47,
      tags: JSON.stringify(["Wheat & Paddy", "With Skilled Operator", "Fast Threshing"]),
      specs: "14 Feet Cutter Bar • Heavy Duty Straw Walker • 101 HP Ashok Leyland Engine",
      with_driver_available: 1
    },
    {
      id: "mc-2",
      name: "Multi-Crop High-Speed Paddy Thresher",
      category: "harvester",
      brand: "Dasmesh",
      hp: "35+ HP Tractor Req.",
      icon: "⚙️",
      rate_per_hour: 650,
      rate_per_day: 4600,
      driver_charge_per_hour: 80,
      location: "Ambala, Haryana (3.5 km away)",
      distance_km: 3.5,
      rating: 4.7,
      reviews_count: 19,
      tags: JSON.stringify(["Clean Grain Output", "Blower Mechanism", "Low Breakage"]),
      specs: "Double Blower System • Multi-Sieve Adjustments • Heavy Flywheel",
      with_driver_available: 1
    },
    {
      id: "mc-3",
      name: "Shaktiman Semi-Champion 7-Feet Rotavator",
      category: "tillage",
      brand: "Shaktiman",
      hp: "45-60 HP Tractor Req.",
      icon: "🌱",
      rate_per_hour: 500,
      rate_per_day: 3500,
      driver_charge_per_hour: 0,
      location: "Hisar, Haryana (2.1 km away)",
      distance_km: 2.1,
      rating: 4.9,
      reviews_count: 64,
      tags: JSON.stringify(["Boron Steel Blades", "Fine Seedbed Prep", "Low Soil Drag"]),
      specs: "Multi Speed Gearbox • 48 L-type Blades • Depth Skid Adjustment",
      with_driver_available: 0
    },
    {
      id: "mc-4",
      name: "9-Tyne Spring Loaded Heavy Cultivator",
      category: "tillage",
      brand: "Fieldking",
      hp: "35-50 HP Tractor Req.",
      icon: "⛏️",
      rate_per_hour: 350,
      rate_per_day: 2400,
      driver_charge_per_hour: 0,
      location: "Muzaffarnagar, Uttar Pradesh (1.8 km away)",
      distance_km: 1.8,
      rating: 4.8,
      reviews_count: 22,
      tags: JSON.stringify(["Stony Soil Proof", "Deep Soil Tilling", "Forged Shovels"]),
      specs: "EN42 Spring Wire • Heavy Channel Frame • Reversible Shovels",
      with_driver_available: 0
    },
    {
      id: "mc-5",
      name: "Automatic Laser Land Leveler with Transmitter",
      category: "leveler",
      brand: "AgriStar",
      hp: "50+ HP Tractor Req.",
      icon: "📐",
      rate_per_hour: 800,
      rate_per_day: 5900,
      driver_charge_per_hour: 120,
      location: "Karnal, Haryana (6.0 km away)",
      distance_km: 6.0,
      rating: 5.0,
      reviews_count: 51,
      tags: JSON.stringify(["Saves 30% Water", "Digital Sensor", "Laser Mast"]),
      specs: "Dual Slope Transmitter • 800m Operating Range • High Speed Hydraulic Control",
      with_driver_available: 1
    },
    {
      id: "mc-6",
      name: "Happy Seeder / Zero-Till Seed Drill",
      category: "seeder",
      brand: "National",
      hp: "45-55 HP Tractor Req.",
      icon: "🌾",
      rate_per_hour: 600,
      rate_per_day: 4200,
      driver_charge_per_hour: 0,
      location: "Patiala, Punjab (4.3 km away)",
      distance_km: 4.3,
      rating: 4.9,
      reviews_count: 33,
      tags: JSON.stringify(["Direct Sowing in Stubble", "Zero Stubble Burning", "Fertilizer Metering"]),
      specs: "Fluted Roller Metering • Inverted T-openers • Straw Management System",
      with_driver_available: 0
    },
    {
      id: "mc-7",
      name: "Tractor-Mounted 500L Boom Crop Sprayer",
      category: "sprayer",
      brand: "Aspee",
      hp: "Tractor PTO Driven",
      icon: "💧",
      rate_per_hour: 450,
      rate_per_day: 3200,
      driver_charge_per_hour: 0,
      location: "Kurukshetra, Haryana (3.8 km away)",
      distance_km: 3.8,
      rating: 4.6,
      reviews_count: 15,
      tags: JSON.stringify(["30ft Wide Spray Boom", "Uniform Micron Mist", "500L Heavy Tank"]),
      specs: "Triplex Plunger Pump • Anti-drip Italian Nozzles • Pressure Regulator Valve",
      with_driver_available: 0
    }
  ];

  for (const item of initialFleet) {
    execute(
      `INSERT INTO machinery 
       (id, name, category, brand, hp, icon, rate_per_hour, rate_per_day, driver_charge_per_hour, location, distance_km, rating, reviews_count, tags, specs, with_driver_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.name,
        item.category,
        item.brand,
        item.hp,
        item.icon,
        item.rate_per_hour,
        item.rate_per_day,
        item.driver_charge_per_hour,
        item.location,
        item.distance_km,
        item.rating,
        item.reviews_count,
        item.tags,
        item.specs,
        item.with_driver_available
      ]
    );
  }

  saveDatabase();
  console.log("Successfully seeded", initialFleet.length, "machinery items.");
}

// ---------- Initialize database and start ----------

async function startServer() {
  try {
    const SQL = await initSqlJs();

    if (fs.existsSync(databasePath)) {
      const savedData = fs.readFileSync(databasePath);
      db = new SQL.Database(savedData);
    } else {
      db = new SQL.Database();
    }

    // 1. Users table with role and phone
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'farmer',
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure columns exist if old table was created
    try { db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'farmer'"); } catch(e) {}
    try { db.run("ALTER TABLE users ADD COLUMN phone TEXT"); } catch(e) {}

    // 2. Machinery table with owner_id
    db.run(`
      CREATE TABLE IF NOT EXISTS machinery (
        id TEXT PRIMARY KEY,
        owner_id INTEGER,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        brand TEXT NOT NULL,
        hp TEXT NOT NULL,
        icon TEXT NOT NULL,
        rate_per_hour INTEGER NOT NULL,
        rate_per_day INTEGER NOT NULL,
        driver_charge_per_hour INTEGER NOT NULL DEFAULT 0,
        location TEXT NOT NULL,
        distance_km REAL NOT NULL,
        rating REAL NOT NULL DEFAULT 4.8,
        reviews_count INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL,
        specs TEXT NOT NULL,
        with_driver_available INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try { db.run("ALTER TABLE machinery ADD COLUMN owner_id INTEGER"); } catch(e) {}

    // 3. Bookings table
    db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_code TEXT NOT NULL UNIQUE,
        user_id INTEGER,
        machinery_id TEXT NOT NULL,
        machinery_name TEXT NOT NULL,
        farmer_location TEXT NOT NULL,
        farmer_phone TEXT NOT NULL,
        booking_date TEXT NOT NULL,
        booking_time TEXT NOT NULL,
        plan_type TEXT NOT NULL,
        duration_count INTEGER NOT NULL,
        work_type TEXT NOT NULL,
        with_driver INTEGER NOT NULL DEFAULT 0,
        total_amount TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Confirmed',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    saveDatabase();
    seedMachineryIfEmpty();

    const server = app.listen(PORT, () => {
      console.log(`FarmEazy server running at http://localhost:${PORT}`);
      console.log("Database:", databasePath);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use by another process. Please close it and try again.`);
      } else {
        console.error("Server error:", err);
      }
    });

    const gracefulExit = () => {
      try {
        if (db) saveDatabase();
      } catch (e) {}
      server.close(() => {
        process.exit(0);
      });
    };

    process.on("SIGINT", gracefulExit);
    process.on("SIGTERM", gracefulExit);
  } catch (error) {
    console.error("Could not start FarmEazy server:", error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
