import type { BenchmarkCase } from "./benchmark.js";

/**
 * Compliance, ethics, accessibility, internationalization, UX, compatibility,
 * portability, and dependency health benchmark cases.
 *
 * Covers COMP, SOV, ETHICS, A11Y, I18N, UX, COMPAT, DEPS, PORTA prefixes.
 */
export const BENCHMARK_COMPLIANCE_ETHICS: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  //  COMP — Compliance violations (HIPAA, PCI-DSS, SOX, GDPR patterns)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "comp-deep-pii-plaintext-log",
    description: "Logging PII (SSN, email, phone) in plaintext — HIPAA/GDPR violation",
    language: "typescript",
    code: `import { logger } from "./logger";

export async function processPatientIntake(patient: PatientRecord) {
  logger.info("Processing patient intake", {
    ssn: patient.ssn,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    email: patient.email,
    phone: patient.phone,
    insuranceId: patient.insuranceId,
    diagnosis: patient.diagnosis,
  });

  const result = await db.patients.insert(patient);
  logger.info(\`Patient record created: \${patient.ssn}, DOB: \${patient.dateOfBirth}\`);
  return result;
}`,
    expectedRuleIds: [],
    category: "compliance",
    difficulty: "easy",
  },
  {
    id: "comp-deep-credit-card-storage",
    description: "Storing full credit card numbers in database — PCI-DSS violation",
    language: "typescript",
    code: `interface PaymentRecord {
  id: string;
  userId: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  amount: number;
}

export async function savePayment(payment: PaymentRecord) {
  await db.query(
    \`INSERT INTO payments (id, user_id, card_number, expiry_month, expiry_year, cvv, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7)\`,
    [payment.id, payment.userId, payment.cardNumber,
     payment.expiryMonth, payment.expiryYear, payment.cvv, payment.amount]
  );
  console.log(\`Payment saved: card ending \${payment.cardNumber.slice(-4)}\`);
}

export async function getPaymentHistory(userId: string) {
  return db.query("SELECT * FROM payments WHERE user_id = $1", [userId]);
  // Returns full card numbers and CVVs
}`,
    expectedRuleIds: ["COMP-001"],
    category: "compliance",
    difficulty: "easy",
  },
  {
    id: "comp-deep-audit-trail-missing",
    description: "Admin operations without audit trail — SOX compliance failure",
    language: "typescript",
    code: `export async function adminDeleteUser(userId: string) {
  await db.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM user_orders WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
  // No audit log, no record of who deleted, no reason captured
}

export async function adminModifyFinancialRecord(
  recordId: string,
  newAmount: number
) {
  await db.query(
    "UPDATE financial_records SET amount = $1 WHERE id = $2",
    [newAmount, recordId]
  );
  // No versioning, no before/after snapshot, no approval workflow
}

export async function adminGrantPermission(userId: string, role: string) {
  await db.query(
    "UPDATE users SET role = $1 WHERE id = $2",
    [role, userId]
  );
  // No record of privilege escalation
}`,
    expectedRuleIds: ["COMP-001"],
    category: "compliance",
    difficulty: "medium",
  },
  {
    id: "comp-deep-gdpr-no-consent",
    description: "Collecting user data without consent management — GDPR violation",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.post("/api/register", async (req, res) => {
  const { email, name, phone, address, dateOfBirth } = req.body;

  const user = await db.users.create({
    email, name, phone, address, dateOfBirth,
    marketingOptIn: true,         // Auto-opted in
    dataSharing: true,            // No explicit consent
    trackingEnabled: true,        // No option to decline
  });

  // Share data with third parties immediately
  await analytics.track("user_registered", { email, name, phone });
  await emailProvider.addSubscriber(email, { name, phone });
  await adNetwork.syncAudience({ email, dateOfBirth, address });

  res.json({ userId: user.id });
});`,
    expectedRuleIds: ["COMP-001"],
    category: "compliance",
    difficulty: "medium",
  },
  {
    id: "comp-deep-data-retention-none",
    description: "No data retention policy — records kept indefinitely",
    language: "typescript",
    code: `export async function logUserActivity(userId: string, action: string, details: any) {
  await db.query(
    "INSERT INTO activity_logs (user_id, action, details, ip_address, user_agent, timestamp) VALUES ($1, $2, $3, $4, $5, NOW())",
    [userId, action, JSON.stringify(details), details.ip, details.userAgent]
  );
  // Logs stored forever — no retention policy
  // No periodic cleanup job
  // No anonymization after retention period
}

export async function storeSessionRecording(userId: string, recording: Buffer) {
  await s3.putObject({
    Bucket: "session-recordings",
    Key: \`\${userId}/\${Date.now()}.webm\`,
    Body: recording,
  });
  // Full session recordings stored indefinitely
  // No lifecycle policy, no user deletion capability
}`,
    expectedRuleIds: [],
    category: "compliance",
    difficulty: "hard",
  },
  {
    id: "comp-deep-phi-api-response",
    description: "API returning Protected Health Information without access controls",
    language: "typescript",
    code: `import express from "express";

const app = express();

// No authentication middleware
app.get("/api/patients/:id", async (req, res) => {
  const patient = await db.query(
    "SELECT * FROM patients WHERE id = $1",
    [req.params.id]
  );

  // Returns all PHI fields including SSN, diagnosis, medications
  res.json(patient);
});

app.get("/api/patients/search", async (req, res) => {
  const { name, dob } = req.query;
  const patients = await db.query(
    "SELECT id, ssn, first_name, last_name, date_of_birth, diagnosis, medications FROM patients WHERE first_name ILIKE $1 OR date_of_birth = $2",
    [\`%\${name}%\`, dob]
  );
  res.json(patients);
});`,
    expectedRuleIds: ["COMP-001"],
    category: "compliance",
    difficulty: "easy",
  },
  {
    id: "comp-deep-encryption-at-rest-missing",
    description: "Sensitive data stored without encryption at rest",
    language: "typescript",
    code: `import fs from "fs";
import path from "path";

export function storeUserDocuments(userId: string, documents: Document[]) {
  const userDir = path.join("/data/documents", userId);
  fs.mkdirSync(userDir, { recursive: true });

  for (const doc of documents) {
    // Storing tax returns, medical records, IDs as plain files
    fs.writeFileSync(
      path.join(userDir, doc.filename),
      doc.content
    );
  }

  // Store metadata in plain JSON
  fs.writeFileSync(
    path.join(userDir, "metadata.json"),
    JSON.stringify({
      ssn: documents[0]?.ssn,
      taxId: documents[0]?.taxId,
      uploadedAt: new Date().toISOString(),
    })
  );
}`,
    expectedRuleIds: ["COMP-001"],
    category: "compliance",
    difficulty: "medium",
  },
  {
    id: "comp-deep-minor-data-no-coppa",
    description: "Collecting data from minors without COPPA compliance",
    language: "typescript",
    code: `export async function registerUser(data: RegistrationData) {
  const user = await db.users.create({
    email: data.email,
    name: data.name,
    age: data.age,
    school: data.school,
    parentEmail: data.parentEmail,
    location: data.location,
  });

  // No age verification
  // No parental consent for users under 13
  // Collecting school information from minors
  // No special data handling for children's data

  await analytics.identify(user.id, {
    age: data.age,
    school: data.school,
    location: data.location,
  });

  await adNetwork.targetUser(user.id, {
    ageGroup: data.age < 13 ? "child" : "teen",
    interests: await inferInterests(user.id),
  });

  return user;
}`,
    expectedRuleIds: [],
    category: "compliance",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  SOV — Data sovereignty violations
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sov-deep-cross-region-transfer",
    description: "EU user data replicated to US region without safeguards",
    language: "typescript",
    code: `const S3_BUCKETS = {
  primary: "s3://us-east-1-data-lake",
  backup: "s3://us-west-2-backup",
};

export async function storeUserData(userId: string, region: string, data: UserData) {
  // All data goes to US buckets regardless of user region
  await s3.putObject({
    Bucket: S3_BUCKETS.primary.replace("s3://", ""),
    Key: \`users/\${userId}/profile.json\`,
    Body: JSON.stringify(data),
  });

  // Backup also in US
  await s3.putObject({
    Bucket: S3_BUCKETS.backup.replace("s3://", ""),
    Key: \`users/\${userId}/profile.json\`,
    Body: JSON.stringify(data),
  });
  // EU users' personal data stored in US without SCCs or adequacy decision
}`,
    expectedRuleIds: [],
    category: "sovereignty",
    difficulty: "medium",
  },
  {
    id: "sov-deep-analytics-third-country",
    description: "Sending analytics data to servers in non-adequate countries",
    language: "typescript",
    code: `import Analytics from "analytics-sdk";

const analytics = new Analytics({
  writeKey: process.env.ANALYTICS_KEY!,
  host: "https://analytics.example-cn.com",  // Server in non-adequate jurisdiction
  flushAt: 20,
});

export function trackUserBehavior(userId: string, event: string, properties: any) {
  analytics.track({
    userId,
    event,
    properties: {
      ...properties,
      email: properties.email,
      ipAddress: properties.ip,
      deviceId: properties.deviceId,
      location: properties.location,
    },
  });
  // Personal data (email, IP, location) sent to third-country server
  // No data processing agreement
  // No user notification about cross-border transfer
}`,
    expectedRuleIds: ["SOV-001"],
    category: "sovereignty",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  ETHICS — Ethical coding violations
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ethics-deep-discriminatory-pricing",
    description: "Pricing algorithm discriminating by demographic attributes",
    language: "python",
    code: `def calculate_insurance_premium(user_profile):
    base_rate = 500

    # Discriminatory factors
    if user_profile['gender'] == 'female':
        base_rate *= 1.2

    if user_profile['zip_code'] in LOW_INCOME_ZIPS:
        base_rate *= 1.5

    if user_profile['ethnicity'] in ['hispanic', 'african_american']:
        base_rate *= 1.3

    # Age-based surcharge (may violate age discrimination laws)
    if user_profile['age'] > 60:
        base_rate *= 2.0

    if user_profile['marital_status'] == 'single':
        base_rate *= 1.1

    return base_rate`,
    expectedRuleIds: [],
    category: "ethics",
    difficulty: "easy",
  },
  {
    id: "ethics-deep-dark-pattern-unsubscribe",
    description: "Dark pattern making unsubscription difficult",
    language: "typescript",
    code: `export function renderUnsubscribePage(userId: string) {
  return \`
    <div style="max-width: 400px; margin: 100px auto;">
      <h2>We're sorry to see you go!</h2>
      <p>Are you sure? You'll miss out on exclusive deals!</p>
      <form action="/api/unsubscribe" method="POST">
        <input type="hidden" name="userId" value="\${userId}" />
        <p>Please tell us why (required):</p>
        <textarea name="reason" required minlength="50"></textarea>
        <p>Type "UNSUBSCRIBE" to confirm:</p>
        <input type="text" name="confirmation" pattern="UNSUBSCRIBE" required />
        <div style="margin-top: 20px;">
          <button type="submit"
            style="background: #ccc; color: #999; font-size: 10px; border: none; padding: 2px 5px;">
            Unsubscribe
          </button>
          <button type="button" onclick="window.location='/'"
            style="background: #007bff; color: white; font-size: 16px; padding: 10px 30px; border: none; border-radius: 5px;">
            Keep my subscription!
          </button>
        </div>
      </form>
    </div>
  \`;
}`,
    expectedRuleIds: [],
    category: "ethics",
    difficulty: "medium",
  },
  {
    id: "ethics-deep-hidden-data-collection",
    description: "Hidden data collection beyond stated purpose",
    language: "typescript",
    code: `export class WeatherWidget {
  async getWeather(location: string) {
    const weather = await fetch(\`https://api.weather.com/\${location}\`);

    // Silently collect additional data beyond weather functionality
    const fingerprint = {
      screenResolution: \`\${screen.width}x\${screen.height}\`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      plugins: Array.from(navigator.plugins).map(p => p.name),
      canvas: this.getCanvasFingerprint(),
      fonts: await this.detectFonts(),
      battery: await (navigator as any).getBattery?.(),
      connection: (navigator as any).connection?.effectiveType,
    };

    // Send to ad network without user knowledge
    navigator.sendBeacon("https://tracking.adnetwork.com/collect", JSON.stringify({
      location,
      ...fingerprint,
      timestamp: Date.now(),
    }));

    return weather.json();
  }

  private getCanvasFingerprint(): string {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("fingerprint", 2, 2);
    return canvas.toDataURL();
  }
}`,
    expectedRuleIds: ["ETHICS-001"],
    category: "ethics",
    difficulty: "hard",
  },
  {
    id: "ethics-deep-addictive-mechanics",
    description: "Gamification mechanics designed to be addictive",
    language: "typescript",
    code: `export class EngagementEngine {
  async onUserLogin(userId: string) {
    const streak = await this.getLoginStreak(userId);

    // Variable-ratio reinforcement schedule (slot machine pattern)
    const reward = Math.random() < 0.1
      ? { type: "jackpot", coins: 1000 }
      : Math.random() < 0.3
        ? { type: "bonus", coins: 50 }
        : { type: "standard", coins: 5 };

    // Loss aversion: threaten to lose streak
    if (streak > 7) {
      await this.sendPush(userId,
        \`🔥 \${streak}-day streak! Don't lose it — log in tomorrow!\`);
    }

    // Artificial scarcity
    await this.showLimitedTimeOffer(userId, {
      expiresIn: 3600,
      message: "⏰ 73% of users already claimed this!",
      fakeCount: Math.floor(Math.random() * 50) + 50,
    });

    // FOMO notifications at optimal engagement times
    this.scheduleNotification(userId, {
      time: this.getPeakEngagementTime(userId),
      message: "Your friends earned 500 coins today! Don't miss out!",
    });
  }
}`,
    expectedRuleIds: [],
    category: "ethics",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  A11Y — Accessibility violations
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "a11y-deep-no-aria-labels",
    description: "Interactive elements without ARIA labels or alt text",
    language: "html",
    code: `<div class="product-card">
  <img src="/products/shoe-123.jpg" />
  <div class="actions">
    <div onclick="addToCart(123)" class="btn">
      <img src="/icons/cart.svg" />
    </div>
    <div onclick="toggleWishlist(123)" class="btn">
      <img src="/icons/heart.svg" />
    </div>
    <div onclick="share(123)" class="btn">
      <img src="/icons/share.svg" />
    </div>
  </div>
  <div class="rating">
    <span style="color: gold">★★★★</span><span style="color: gray">★</span>
  </div>
  <div onclick="openModal(123)" style="color: #aaa; font-size: 10px;">
    More details
  </div>
</div>`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "easy",
  },
  {
    id: "a11y-deep-no-keyboard-nav",
    description: "Custom dropdown without keyboard navigation support",
    language: "typescript",
    code: `export function CustomDropdown({ options, onSelect }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(options[0]);

  return (
    <div className="dropdown">
      <div
        className="dropdown-toggle"
        onClick={() => setIsOpen(!isOpen)}
        style={{ cursor: "pointer" }}
      >
        {selected.label}
        <span className="arrow">{isOpen ? "▲" : "▼"}</span>
      </div>
      {isOpen && (
        <div className="dropdown-menu">
          {options.map((opt) => (
            <div
              key={opt.value}
              className="dropdown-item"
              onClick={() => {
                setSelected(opt);
                onSelect(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  // No tabIndex, no role, no aria-expanded, no keyboard handlers
  // Cannot be operated without a mouse
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "medium",
  },
  {
    id: "a11y-deep-color-only-indicator",
    description: "Using color as the only means of conveying information",
    language: "typescript",
    code: `export function StatusIndicator({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "#00ff00",
    warning: "#ffaa00",
    error: "#ff0000",
    disabled: "#cccccc",
  };

  return (
    <div>
      <span
        style={{
          display: "inline-block",
          width: "12px",
          height: "12px",
          borderRadius: "50%",
          backgroundColor: colorMap[status] || "#ccc",
        }}
      />
      {/* No text label, no icon, no pattern — color-blind users cannot distinguish */}
    </div>
  );
}

export function FormValidation({ errors }: { errors: Record<string, string> }) {
  return (
    <form>
      <input
        type="email"
        style={{ borderColor: errors.email ? "red" : "green" }}
      />
      {/* No error message text, just border color change */}
      <input
        type="password"
        style={{ borderColor: errors.password ? "red" : "green" }}
      />
    </form>
  );
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "medium",
  },
  {
    id: "a11y-deep-form-no-labels",
    description: "Form inputs without associated labels",
    language: "html",
    code: `<form action="/register" method="POST">
  <div class="form-group">
    <input type="text" name="firstName" placeholder="First Name" />
  </div>
  <div class="form-group">
    <input type="text" name="lastName" placeholder="Last Name" />
  </div>
  <div class="form-group">
    <input type="email" name="email" placeholder="Email Address" />
  </div>
  <div class="form-group">
    <input type="password" name="password" placeholder="Password" />
  </div>
  <div class="form-group">
    <input type="tel" name="phone" placeholder="Phone Number" />
  </div>
  <div class="form-group">
    <select name="country">
      <option value="">Select Country</option>
      <option value="us">United States</option>
      <option value="uk">United Kingdom</option>
    </select>
  </div>
  <div onclick="submitForm()" class="submit-btn">Register</div>
</form>`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "easy",
  },
  {
    id: "a11y-deep-dynamic-content-no-announce",
    description: "Dynamic content updates without screen reader announcements",
    language: "typescript",
    code: `export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const ws = new WebSocket("wss://api.example.com/notifications");
    ws.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      setNotifications((prev) => [notification, ...prev]);
      // No aria-live region
      // Screen reader users don't know new notifications arrived
    };
    return () => ws.close();
  }, []);

  return (
    <div className="notification-panel">
      {notifications.length > 0 && (
        <span className="badge">{notifications.length}</span>
      )}
      <div className="notification-list">
        {notifications.map((n) => (
          <div key={n.id} className="notification-item">
            <div>{n.title}</div>
            <div style={{ fontSize: "12px", color: "#999" }}>{n.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  I18N — Internationalization issues
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "i18n-deep-hardcoded-strings",
    description: "UI strings hardcoded instead of using i18n framework",
    language: "typescript",
    code: `export function CheckoutPage({ cart }: { cart: CartItem[] }) {
  const total = cart.reduce((sum, item) => sum + item.price, 0);

  return (
    <div>
      <h1>Shopping Cart</h1>
      <p>You have {cart.length} items in your cart</p>
      {cart.map((item) => (
        <div key={item.id}>
          <span>{item.name}</span>
          <span>$\{item.price.toFixed(2)}</span>
          <button>Remove</button>
        </div>
      ))}
      <div className="total">
        <strong>Total: $\{total.toFixed(2)}</strong>
      </div>
      <button>Proceed to Checkout</button>
      <p style={{ fontSize: "12px" }}>
        By clicking "Proceed to Checkout" you agree to our Terms of Service
        and Privacy Policy.
      </p>
    </div>
  );
}`,
    expectedRuleIds: ["I18N-001"],
    category: "internationalization",
    difficulty: "easy",
  },
  {
    id: "i18n-deep-date-format-hardcoded",
    description: "Date/time formatting hardcoded to US format",
    language: "typescript",
    code: `export function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return \`\${month}/\${day}/\${year}\`;  // US format only
}

export function formatCurrency(amount: number): string {
  return "$" + amount.toFixed(2);  // US dollars only
}

export function formatPhoneNumber(phone: string): string {
  // Assumes US phone format
  return \`(\${phone.slice(0, 3)}) \${phone.slice(3, 6)}-\${phone.slice(6)}\`;
}

export function formatAddress(address: Address): string {
  // US address format only
  return \`\${address.street}\\n\${address.city}, \${address.state} \${address.zip}\`;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}`,
    expectedRuleIds: ["I18N-001"],
    category: "internationalization",
    difficulty: "medium",
  },
  {
    id: "i18n-deep-string-concat-plurals",
    description: "String concatenation breaking pluralization rules",
    language: "typescript",
    code: `export function getResultsMessage(count: number, query: string): string {
  if (count === 0) {
    return "No results found for \\"" + query + "\\"";
  }
  return count + " result" + (count > 1 ? "s" : "") + " found for \\"" + query + "\\"";
  // Breaks in languages where plural rules differ (Arabic, Polish, Russian)
}

export function getTimeAgo(seconds: number): string {
  if (seconds < 60) return seconds + " second" + (seconds !== 1 ? "s" : "") + " ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + " minute" + (minutes !== 1 ? "s" : "") + " ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " hour" + (hours !== 1 ? "s" : "") + " ago";
  const days = Math.floor(hours / 24);
  return days + " day" + (days !== 1 ? "s" : "") + " ago";
}`,
    expectedRuleIds: [],
    category: "internationalization",
    difficulty: "medium",
  },
  {
    id: "i18n-deep-regex-ascii-only",
    description: "Validation using ASCII-only patterns rejecting international input",
    language: "typescript",
    code: `export function validateName(name: string): boolean {
  return /^[A-Za-z\\s'-]+$/.test(name);
  // Rejects: José, Müller, 田中太郎, Ñoño, Ólafur
}

export function validateAddress(address: string): boolean {
  return /^[A-Za-z0-9\\s,.-]+$/.test(address);
  // Rejects: addresses with ü, ö, ñ, Chinese/Japanese/Korean characters
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // Strips all non-ASCII characters — "café" becomes "caf"
}

export function sanitizeUsername(username: string): string {
  return username.replace(/[^a-zA-Z0-9_]/g, "");
  // Removes valid Unicode letters
}`,
    expectedRuleIds: [],
    category: "internationalization",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  UX — User experience antipatterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ux-deep-error-stack-trace",
    description: "Showing raw error stack traces to end users",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await db.findUser(req.params.id);
    res.json(user);
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      query: \`SELECT * FROM users WHERE id = '\${req.params.id}'\`,
      connectionString: process.env.DATABASE_URL,
    });
  }
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(500).send(\`
    <h1>Internal Server Error</h1>
    <pre>\${err.stack}</pre>
    <p>Request: \${req.method} \${req.url}</p>
    <p>Headers: \${JSON.stringify(req.headers)}</p>
  \`);
});`,
    expectedRuleIds: ["UX-001"],
    category: "ux",
    difficulty: "easy",
  },
  {
    id: "ux-deep-no-loading-states",
    description: "Async operations without loading or feedback states",
    language: "typescript",
    code: `export function PaymentForm() {
  const handleSubmit = async () => {
    // No loading indicator — user doesn't know if click registered
    // No button disable — user can click multiple times
    const response = await fetch("/api/payments", {
      method: "POST",
      body: JSON.stringify({ amount: 99.99 }),
    });

    if (response.ok) {
      window.location.href = "/success";
    }
    // No error handling — if request fails, nothing happens
    // User left staring at the same form
  };

  return (
    <form>
      <input type="text" name="cardNumber" />
      <button type="button" onClick={handleSubmit}>
        Pay $99.99
      </button>
    </form>
  );
}`,
    expectedRuleIds: ["UX-001"],
    category: "ux",
    difficulty: "easy",
  },
  {
    id: "ux-deep-inconsistent-error-messages",
    description: "Inconsistent and unhelpful error messages across endpoints",
    language: "typescript",
    code: `app.post("/api/register", async (req, res) => {
  if (!req.body.email) return res.status(400).json({ error: "Bad request" });
  if (!req.body.password) return res.status(400).json({ msg: "missing field" });
  if (req.body.password.length < 8) return res.status(422).json({ message: "too short" });
  if (await db.findUser(req.body.email)) return res.status(409).json({ err: "exists" });
  // Different error field names: error, msg, message, err
  // No error codes, no actionable messages
});

app.post("/api/orders", async (req, res) => {
  if (!req.body.items) return res.status(400).send("Error");
  if (req.body.items.length === 0) return res.status(400).json("No items"); // String instead of object
  // Status code inconsistency: sometimes 400, sometimes 422
});

app.put("/api/profile", async (req, res) => {
  if (!req.body.name) return res.status(500).json({ error: "Name required" }); // Wrong status code
});`,
    expectedRuleIds: ["UX-001"],
    category: "ux",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMPAT — Compatibility issues
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "compat-deep-breaking-api-change",
    description: "Breaking API change without versioning",
    language: "typescript",
    code: `// Before: GET /api/users returned { id, name, email }
// After: Breaking change — different shape, no version bump

app.get("/api/users/:id", async (req, res) => {
  const user = await db.findUser(req.params.id);

  // Changed response shape without versioning
  res.json({
    data: {
      userId: user.id,         // was: id
      fullName: user.name,     // was: name
      emailAddress: user.email, // was: email
      metadata: {
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    },
    // Removed: was flat object, now nested under "data"
  });
});

// Changed: POST body shape also changed
app.post("/api/users", async (req, res) => {
  // Was: { name, email, password }
  // Now: { user: { fullName, emailAddress, credentials: { password } } }
  const { user } = req.body;
  const created = await db.createUser({
    name: user.fullName,
    email: user.emailAddress,
    password: user.credentials.password,
  });
  res.json({ data: created });
});`,
    expectedRuleIds: ["COMPAT-001"],
    category: "compatibility",
    difficulty: "medium",
  },
  {
    id: "compat-deep-browser-api-no-fallback",
    description: "Using modern browser APIs without feature detection or fallback",
    language: "typescript",
    code: `export class AppInitializer {
  async init() {
    // No feature detection — crashes in older browsers
    const observer = new IntersectionObserver(this.handleIntersect);
    const resizeObserver = new ResizeObserver(this.handleResize);

    // Uses optional chaining without transpilation target
    const data = await navigator.clipboard?.readText();

    // Web Crypto without fallback
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    // Uses structuredClone without polyfill
    const clonedData = structuredClone(this.state);

    // Uses AbortSignal.timeout without check
    const response = await fetch("/api/data", {
      signal: AbortSignal.timeout(5000),
    });

    // Uses Array.at() without polyfill
    const lastItem = this.items.at(-1);
  }
}`,
    expectedRuleIds: [],
    category: "compatibility",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  DEPS — Dependency health issues
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "deps-deep-abandoned-packages",
    description: "Using abandoned/deprecated packages in production",
    language: "json",
    code: `{
  "name": "production-api",
  "version": "2.0.0",
  "dependencies": {
    "express": "^3.21.2",
    "request": "^2.88.2",
    "moment": "^2.29.4",
    "lodash": "^3.10.1",
    "node-uuid": "^1.4.8",
    "jade": "^1.11.0",
    "coffee-script": "^1.12.7",
    "bcrypt-nodejs": "^0.0.3",
    "mongo-express": "^0.49.0",
    "bower": "^1.8.14",
    "gulp": "^3.9.1"
  },
  "devDependencies": {
    "grunt": "^1.0.0",
    "phantomjs": "^2.1.7"
  }
}`,
    expectedRuleIds: ["DEPS-001"],
    category: "dependency-health",
    difficulty: "easy",
  },
  {
    id: "deps-deep-no-lockfile",
    description: "Package.json with wide version ranges and no lockfile strategy",
    language: "json",
    code: `{
  "name": "api-service",
  "version": "1.0.0",
  "dependencies": {
    "express": "*",
    "mongoose": ">=5.0.0",
    "jsonwebtoken": "~8",
    "bcryptjs": "",
    "cors": "latest",
    "helmet": ">=0.0.0",
    "winston": "^2 || ^3",
    "dotenv": ">=8.0.0 <20.0.0"
  },
  "scripts": {
    "start": "node server.js",
    "install": "rm -f package-lock.json && npm install --no-package-lock"
  }
}`,
    expectedRuleIds: ["DEPS-001"],
    category: "dependency-health",
    difficulty: "medium",
  },
  {
    id: "deps-deep-pip-no-pin",
    description: "Python requirements without version pinning",
    language: "python",
    code: `# requirements.txt loaded via:
# pip install -r requirements.txt

"""
flask
requests
sqlalchemy
celery
redis
pillow
boto3
cryptography
pyyaml
jinja2
django
numpy
pandas
"""

# No version pins at all
# A single dependency update could break production

import flask
import requests
import sqlalchemy

app = flask.Flask(__name__)

@app.route("/data")
def get_data():
    resp = requests.get("https://api.example.com/data")
    return resp.json()`,
    expectedRuleIds: [],
    category: "dependency-health",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  PORTA — Portability issues
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "porta-deep-windows-paths",
    description: "Hardcoded Windows-specific file paths",
    language: "typescript",
    code: `import fs from "fs";

const LOG_DIR = "C:\\\\Program Files\\\\MyApp\\\\logs";
const CONFIG_FILE = "C:\\\\Users\\\\admin\\\\AppData\\\\MyApp\\\\config.ini";
const TEMP_DIR = "C:\\\\Windows\\\\Temp\\\\myapp";

export function writeLog(message: string) {
  const logFile = LOG_DIR + "\\\\app.log";
  fs.appendFileSync(logFile, message + "\\r\\n");
}

export function loadConfig() {
  return fs.readFileSync(CONFIG_FILE, "utf-8");
}

export function createTempFile(name: string) {
  const tempPath = TEMP_DIR + "\\\\" + name;
  fs.writeFileSync(tempPath, "");
  return tempPath;
}

export function runBackup() {
  const backupDir = "D:\\\\Backups\\\\MyApp\\\\" + new Date().toISOString().slice(0, 10);
  fs.mkdirSync(backupDir, { recursive: true });
  // Assumes D: drive exists, Windows path separators throughout
}`,
    expectedRuleIds: ["PORTA-001"],
    category: "portability",
    difficulty: "easy",
  },
  {
    id: "porta-deep-shell-specific-commands",
    description: "Build scripts using OS-specific shell commands",
    language: "json",
    code: `{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "clean": "rm -rf dist && rm -rf node_modules/.cache",
    "prebuild": "mkdir -p dist/assets && cp -r static/* dist/assets/",
    "build": "NODE_ENV=production webpack --config webpack.prod.js",
    "postbuild": "find dist -name '*.map' -delete && chmod -R 755 dist",
    "start": "PORT=3000 node dist/server.js",
    "dev": "export DEBUG=app:* && nodemon src/server.ts",
    "test": "grep -r 'TODO' src/ || true && jest",
    "deploy": "rsync -avz dist/ user@server:/var/www/app/ && ssh user@server 'systemctl restart app'"
  }
}`,
    expectedRuleIds: [],
    category: "portability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional COMP cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "comp-deep-right-to-erasure-missing",
    description: "No mechanism for GDPR right to erasure (right to be forgotten)",
    language: "typescript",
    code: `export class UserService {
  async deleteAccount(userId: string) {
    // Only deactivates — doesn't actually delete personal data
    await db.query("UPDATE users SET active = false WHERE id = $1", [userId]);
    // User data remains in:
    // - users table (name, email, phone, address)
    // - order_history (full purchase details)
    // - support_tickets (conversation transcripts)
    // - marketing_lists (email, preferences)
    // - analytics_events (browsing behavior, IP addresses)
    // - backup_snapshots (full database copies)
    // No cascading deletion, no data anonymization
  }

  async exportUserData(userId: string) {
    // Returns only partial data — not GDPR Article 20 compliant
    const user = await db.query("SELECT name, email FROM users WHERE id = $1", [userId]);
    return user;
    // Missing: order history, support conversations, analytics data,
    // inferred profiles, third-party shared data
  }
}`,
    expectedRuleIds: [],
    category: "compliance",
    difficulty: "hard",
  },
  {
    id: "comp-deep-medical-unencrypted-api",
    description: "Medical records API transmitting PHI without TLS enforcement",
    language: "typescript",
    code: `import express from "express";

const app = express();

// No TLS enforcement — accepts HTTP connections
app.get("/api/medical-records/:patientId", async (req, res) => {
  const records = await db.query(
    "SELECT diagnosis, medications, lab_results, doctor_notes FROM medical_records WHERE patient_id = $1",
    [req.params.patientId]
  );

  // No encryption in transit enforcement
  // No HSTS header
  // No certificate pinning
  res.json(records);
});

// Starts on HTTP
app.listen(3000, () => {
  console.log("Medical API running on http://localhost:3000");
});`,
    expectedRuleIds: [],
    category: "compliance",
    difficulty: "medium",
  },
  {
    id: "comp-deep-biometric-no-consent",
    description: "Biometric data collection without explicit consent (BIPA violation)",
    language: "typescript",
    code: `export class FaceRecognitionService {
  async enrollUser(userId: string, imageBuffer: Buffer) {
    // Extract facial features without explicit biometric consent
    const embedding = await this.extractFaceEmbedding(imageBuffer);

    // Store biometric data indefinitely
    await db.query(
      "INSERT INTO face_embeddings (user_id, embedding, raw_image) VALUES ($1, $2, $3)",
      [userId, embedding, imageBuffer]
    );

    // Share with third-party verification service
    await thirdPartyVerifier.registerFace(userId, embedding);

    // No consent form
    // No retention schedule
    // No opt-out mechanism
    // No data breach notification plan for biometric data
  }

  async identifyPerson(imageBuffer: Buffer): Promise<string | null> {
    const embedding = await this.extractFaceEmbedding(imageBuffer);
    // Scan all stored faces without individual consent
    const match = await db.query(
      "SELECT user_id FROM face_embeddings ORDER BY embedding <-> $1 LIMIT 1",
      [embedding]
    );
    return match.rows[0]?.user_id;
  }
}`,
    expectedRuleIds: [],
    category: "compliance",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional SOV cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sov-deep-cdn-no-geo-restriction",
    description: "CDN serving user content globally without geo-restrictions",
    language: "typescript",
    code: `import { CloudFront } from "@aws-sdk/client-cloudfront";

export async function createCDNDistribution(originBucket: string) {
  const cf = new CloudFront({});
  await cf.createDistribution({
    DistributionConfig: {
      Origins: {
        Items: [{ DomainName: \`\${originBucket}.s3.amazonaws.com\`, Id: originBucket }],
        Quantity: 1,
      },
      DefaultCacheBehavior: {
        TargetOriginId: originBucket,
        ViewerProtocolPolicy: "allow-all",
        ForwardedValues: { QueryString: false, Cookies: { Forward: "none" } },
      },
      Enabled: true,
      // No geo-restrictions — user documents cached in all edge locations globally
      // EU user data cached in China, Russia, etc.
      Restrictions: {
        GeoRestriction: { RestrictionType: "none", Quantity: 0 },
      },
      Comment: "User document CDN",
      CallerReference: Date.now().toString(),
    },
  });
}`,
    expectedRuleIds: [],
    category: "sovereignty",
    difficulty: "hard",
  },
  {
    id: "sov-deep-backup-wrong-region",
    description: "Database backups stored in different jurisdiction than source",
    language: "typescript",
    code: `export async function configureBackups(databaseId: string) {
  // Primary database in EU (Frankfurt)
  // But backups go to cheapest region regardless of data residency
  await rds.modifyDBInstance({
    DBInstanceIdentifier: databaseId,
    BackupRetentionPeriod: 30,
  });

  // Cross-region backup to US for "disaster recovery"
  await rds.startDBInstanceAutomatedBackupsReplication({
    SourceDBInstanceArn: \`arn:aws:rds:eu-central-1:123456:db:\${databaseId}\`,
    BackupRetentionPeriod: 30,
    KmsKeyId: "alias/us-backup-key",
    // Replicating EU personal data to US region
    // No Standard Contractual Clauses
    // No data processing agreement for cross-border transfer
  });

  // Also copy snapshots to third region
  await rds.copyDBSnapshot({
    SourceDBSnapshotIdentifier: "latest-snapshot",
    TargetDBSnapshotIdentifier: "dr-copy",
    SourceRegion: "eu-central-1",
    // Copies to ap-southeast-1 (Singapore) by default
  });
}`,
    expectedRuleIds: ["SOV-001"],
    category: "sovereignty",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional ETHICS cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ethics-deep-manipulative-urgency",
    description: "Fake urgency and scarcity tactics to pressure purchases",
    language: "typescript",
    code: `export function ProductPage({ product }: { product: Product }) {
  // Fake "limited stock" — always shows low number
  const fakeStock = Math.floor(Math.random() * 3) + 1;

  // Fake "other viewers" count
  const fakeViewers = Math.floor(Math.random() * 20) + 15;

  // Countdown timer that resets every visit
  const fakeDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000);

  return (
    <div>
      <h1>{product.name}</h1>
      <div className="urgency-banner" style={{ color: "red" }}>
        ⚠️ Only {fakeStock} left in stock!
      </div>
      <div className="social-proof">
        👀 {fakeViewers} people are viewing this right now
      </div>
      <div className="timer">
        ⏰ Sale ends in: <Countdown deadline={fakeDeadline} />
      </div>
      <div className="recent-purchases">
        {/* Fabricated recent purchase notifications */}
        <p>🛒 Sarah from NYC just bought this 3 minutes ago</p>
        <p>🛒 Mike from LA just bought this 7 minutes ago</p>
      </div>
      <button>Buy Now — Before It's Gone!</button>
    </div>
  );
}`,
    expectedRuleIds: ["ETHICS-001"],
    category: "ethics",
    difficulty: "medium",
  },
  {
    id: "ethics-deep-shadow-banning",
    description: "Shadow banning users without notification or appeal",
    language: "typescript",
    code: `export class ModerationService {
  async shadowBan(userId: string, reason: string) {
    await db.query(
      "UPDATE users SET shadow_banned = true, shadow_ban_reason = $1 WHERE id = $2",
      [reason, userId]
    );
    // User is never notified
    // No appeal mechanism
    // No time limit — permanent by default
  }

  async getPostsForFeed(viewerId: string, posts: Post[]) {
    return posts.map(post => {
      if (post.authorId === viewerId) {
        // Banned user sees their own posts normally
        return { ...post, visible: true };
      }
      // But everyone else can't see them
      const author = await db.findUser(post.authorId);
      if (author.shadow_banned) {
        return null; // Silently removed
      }
      return { ...post, visible: true };
    }).filter(Boolean);
    // User thinks their posts are public but nobody can see them
    // No transparency, no due process
  }
}`,
    expectedRuleIds: [],
    category: "ethics",
    difficulty: "hard",
  },
  {
    id: "ethics-deep-algorithmic-bias-hiring",
    description: "Hiring algorithm with biased training features",
    language: "python",
    code: `import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier

def train_resume_screener(training_data: pd.DataFrame):
    # Features that introduce bias
    features = [
        'years_experience',
        'university_ranking',      # Biased against non-traditional education
        'zip_code',                # Proxy for race/socioeconomic status
        'name_origin_score',       # Directly discriminatory
        'graduation_year',         # Age proxy
        'has_gap_in_employment',   # Biased against caregivers/parents
        'club_memberships',        # Cultural bias
        'linkedin_connections',    # Network privilege bias
    ]

    X = training_data[features]
    # Labels from historical hiring decisions (which were themselves biased)
    y = training_data['was_hired']

    model = GradientBoostingClassifier()
    model.fit(X, y)
    # No bias audit
    # No disparate impact analysis
    # No fairness metrics evaluation
    return model

def screen_resume(model, resume_data):
    score = model.predict_proba([resume_data])[0][1]
    return {
        'score': score,
        'recommendation': 'proceed' if score > 0.7 else 'reject',
        # No explanation for rejection
        # No human review requirement
    }`,
    expectedRuleIds: [],
    category: "ethics",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional A11Y cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "a11y-deep-video-no-captions",
    description: "Video player without captions or transcript support",
    language: "typescript",
    code: `export function VideoPlayer({ src, title }: VideoProps) {
  return (
    <div className="video-container">
      <video
        src={src}
        controls
        autoPlay
        style={{ width: "100%" }}
      >
        {/* No <track> elements for captions/subtitles */}
        {/* No aria-label */}
        {/* autoPlay without user consent — problematic for screen readers */}
      </video>
      <div className="video-info">
        <span style={{ fontWeight: "bold" }}>{title}</span>
      </div>
      {/* No transcript available */}
      {/* No audio description track */}
    </div>
  );
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "medium",
  },
  {
    id: "a11y-deep-table-no-headers",
    description: "Data table without proper header associations",
    language: "html",
    code: `<div class="data-table">
  <div style="display: flex; background: #eee; font-weight: bold;">
    <div style="flex: 1; padding: 8px;">Name</div>
    <div style="flex: 1; padding: 8px;">Role</div>
    <div style="flex: 1; padding: 8px;">Status</div>
    <div style="flex: 1; padding: 8px;">Actions</div>
  </div>
  <div style="display: flex; border-bottom: 1px solid #ddd;">
    <div style="flex: 1; padding: 8px;">Alice Smith</div>
    <div style="flex: 1; padding: 8px;">Admin</div>
    <div style="flex: 1; padding: 8px;">
      <span style="color: green;">●</span>
    </div>
    <div style="flex: 1; padding: 8px;">
      <img src="/icons/edit.svg" onclick="edit(1)" style="cursor: pointer;" />
      <img src="/icons/delete.svg" onclick="del(1)" style="cursor: pointer;" />
    </div>
  </div>
</div>
<!-- Using divs instead of <table>, <th>, <td> -->
<!-- No scope attributes, no caption, no summary -->
<!-- Status uses color-only indicator -->
<!-- Action icons have no alt text -->`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "medium",
  },
  {
    id: "a11y-deep-focus-trap",
    description: "Modal dialog with no focus management or escape handling",
    language: "typescript",
    code: `export function Modal({ isOpen, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
      }}
    >
      <div className="modal-content" style={{ background: "white", padding: "20px" }}>
        {children}
        <div
          className="close-btn"
          onClick={() => {/* close */}}
          style={{ cursor: "pointer", float: "right" }}
        >
          ✕
        </div>
      </div>
    </div>
  );
  // No role="dialog"
  // No aria-modal="true"
  // No focus trap — Tab key goes to elements behind modal
  // No Escape key handler
  // No aria-labelledby
  // Close button is a div, not a button
  // Focus not returned to trigger element on close
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional I18N cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "i18n-deep-rtl-not-supported",
    description: "Layout hardcoded to LTR, breaks for RTL languages",
    language: "typescript",
    code: `export function ChatBubble({ message, isSent }: ChatBubbleProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isSent ? "flex-end" : "flex-start",
        // Hardcoded flex-end/start — breaks in RTL
        marginLeft: isSent ? "40px" : "0",
        marginRight: isSent ? "0" : "40px",
        // Hardcoded left/right margins — inverted in RTL
      }}
    >
      <div
        style={{
          background: isSent ? "#007bff" : "#e9ecef",
          borderRadius: "18px 18px 4px 18px",
          // Asymmetric border-radius — wrong corners in RTL
          padding: "8px 16px",
          textAlign: "left",
          // Always left-aligned — should be "start" for RTL
        }}
      >
        {message.text}
        <div style={{ fontSize: "11px", textAlign: "right" }}>
          {/* Timestamp always right-aligned */}
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}`,
    expectedRuleIds: [],
    category: "internationalization",
    difficulty: "hard",
  },
  {
    id: "i18n-deep-number-formatting",
    description: "Number formatting hardcoded to Western conventions",
    language: "typescript",
    code: `export function formatNumber(val: number): string {
  // US-centric: 1,000,000.50
  // Germany expects: 1.000.000,50
  // India expects: 10,00,000.50
  return val.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
}

export function formatPercentage(val: number): string {
  return val.toFixed(1) + "%";
  // Turkey uses: %50,0 (percent sign before number)
}

export function formatFileSize(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB"];
  // Hardcoded English unit names
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return size.toFixed(1) + " " + units[i];
}

export function parseUserInput(input: string): number {
  // Only handles 1,234.56 format — fails for 1.234,56
  return parseFloat(input.replace(/,/g, ""));
}`,
    expectedRuleIds: [],
    category: "internationalization",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional UX cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ux-deep-destructive-no-confirmation",
    description: "Destructive actions without confirmation or undo",
    language: "typescript",
    code: `export function ProjectDashboard({ projects }: DashboardProps) {
  const handleDelete = async (projectId: string) => {
    // Immediate hard delete — no confirmation dialog
    await fetch(\`/api/projects/\${projectId}\`, { method: "DELETE" });
    window.location.reload();
    // No undo capability
    // No soft delete / trash
    // Page reload loses scroll position and context
  };

  return (
    <div>
      {projects.map((project) => (
        <div key={project.id} className="project-card">
          <h3>{project.name}</h3>
          <button onClick={() => handleDelete(project.id)}>
            Delete
          </button>
          {/* Delete button same style as other actions */}
          {/* No visual distinction for destructive action */}
        </div>
      ))}
    </div>
  );
}`,
    expectedRuleIds: [],
    category: "ux",
    difficulty: "easy",
  },
  {
    id: "ux-deep-infinite-scroll-no-fallback",
    description: "Infinite scroll with no pagination fallback or position memory",
    language: "typescript",
    code: `export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        fetch(\`/api/products?page=\${page}\`)
          .then(r => r.json())
          .then(data => {
            setProducts(prev => [...prev, ...data]);
            setPage(p => p + 1);
          });
        // No loading indicator during fetch
        // No error handling if fetch fails
      }
    });
    observer.observe(document.getElementById("sentinel")!);
  }, [page]);

  return (
    <div>
      {products.map(p => (
        <a key={p.id} href={\`/products/\${p.id}\`}>
          {/* Clicking a product, then pressing Back loses scroll position */}
          {/* User must re-scroll through hundreds of items */}
          <div>{p.name}</div>
        </a>
      ))}
      <div id="sentinel" />
      {/* No way to jump to a specific page */}
      {/* No total count shown */}
      {/* Footer unreachable — pushed down infinitely */}
    </div>
  );
}`,
    expectedRuleIds: [],
    category: "ux",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional COMPAT cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "compat-deep-deprecated-node-apis",
    description: "Using deprecated Node.js APIs without migration plan",
    language: "typescript",
    code: `import { createCipher, createDecipher } from "crypto";
import { exists } from "fs";
import { parse } from "url";
import { createServer } from "http";

// crypto.createCipher deprecated since Node 10
export function encrypt(data: string, key: string): string {
  const cipher = createCipher("aes-256-cbc", key);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

// fs.exists deprecated since Node 1.0
export function checkFile(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    exists(path, resolve);
  });
}

// url.parse deprecated since Node 11
export function getPathname(urlStr: string): string {
  const parsed = parse(urlStr);
  return parsed.pathname || "/";
}

const server = createServer((req, res) => {
  // Using deprecated req.connection
  const ip = req.connection.remoteAddress;
  // Using deprecated Buffer constructor
  const body = new Buffer(1024);
  res.end("OK");
});`,
    expectedRuleIds: [],
    category: "compatibility",
    difficulty: "medium",
  },
  {
    id: "compat-deep-vendor-lock-in",
    description: "Deep vendor lock-in with no abstraction layer",
    language: "typescript",
    code: `import {
  DynamoDB, S3, SQS, SNS, Lambda,
  CloudWatch, SecretsManager,
} from "aws-sdk";

export class OrderService {
  private dynamo = new DynamoDB.DocumentClient();
  private s3 = new S3();
  private sqs = new SQS();
  private sns = new SNS();

  async createOrder(order: Order) {
    // DynamoDB-specific: using DynamoDB expressions directly
    await this.dynamo.put({
      TableName: "Orders",
      Item: order,
      ConditionExpression: "attribute_not_exists(orderId)",
    }).promise();

    // SQS-specific: using SQS message attributes
    await this.sqs.sendMessage({
      QueueUrl: process.env.ORDER_QUEUE_URL!,
      MessageBody: JSON.stringify(order),
      MessageGroupId: order.customerId,
      MessageDeduplicationId: order.orderId,
    }).promise();

    // SNS-specific: using SNS message filtering
    await this.sns.publish({
      TopicArn: process.env.ORDER_TOPIC!,
      Message: JSON.stringify(order),
      MessageAttributes: {
        orderType: { DataType: "String", StringValue: order.type },
      },
    }).promise();

    // Lambda invoke — tight coupling to AWS Lambda
    await new Lambda().invoke({
      FunctionName: "processOrderPayment",
      InvocationType: "Event",
      Payload: JSON.stringify(order),
    }).promise();
    // No abstraction layer — impossible to migrate to GCP/Azure
  }
}`,
    expectedRuleIds: [],
    category: "compatibility",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional DEPS cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "deps-deep-typosquat-risk",
    description: "Dependencies with names similar to popular packages (typosquatting risk)",
    language: "json",
    code: `{
  "name": "my-api",
  "dependencies": {
    "expresss": "^4.18.0",
    "loadash": "^4.17.21",
    "axois": "^1.6.0",
    "cross-env2": "^7.0.3",
    "colurs": "^1.4.0",
    "electorn": "^28.0.0",
    "babel-coree": "^6.26.3"
  },
  "devDependencies": {
    "eslintt": "^8.56.0",
    "webpackk": "^5.90.0"
  }
}`,
    expectedRuleIds: [],
    category: "dependency-health",
    difficulty: "easy",
  },
  {
    id: "deps-deep-excessive-dependencies",
    description: "Massively bloated dependencies for simple functionality",
    language: "typescript",
    code: `// Using huge libraries for tiny tasks
import _ from "lodash";              // 70KB for one function
import moment from "moment";          // 300KB+ for date formatting
import jQuery from "jquery";          // 87KB for DOM query
import { v4 as uuid } from "uuid";   // Could use crypto.randomUUID()

export function processItems(items: any[]) {
  // Using lodash just for array flatten
  const flat = _.flatten(items);       // Array.flat() is native

  // Using moment just for ISO string
  const now = moment().toISOString();  // new Date().toISOString()

  // Using jQuery for querySelector
  const el = jQuery("#app");           // document.querySelector("#app")

  // Using uuid when crypto.randomUUID exists
  const id = uuid();                    // crypto.randomUUID()

  return { flat, now, id };
}`,
    expectedRuleIds: ["DEPS-001"],
    category: "dependency-health",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional PORTA cases
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "porta-deep-linux-specific-syscalls",
    description: "Using Linux-specific system calls and paths in Node.js",
    language: "typescript",
    code: `import { execSync } from "child_process";
import fs from "fs";

export function getSystemInfo() {
  // Linux-specific /proc filesystem
  const memInfo = fs.readFileSync("/proc/meminfo", "utf-8");
  const cpuInfo = fs.readFileSync("/proc/cpuinfo", "utf-8");
  const loadAvg = fs.readFileSync("/proc/loadavg", "utf-8");

  // Linux-specific commands
  const diskUsage = execSync("df -h /").toString();
  const networkInterfaces = execSync("ifconfig").toString();
  const runningProcesses = execSync("ps aux | grep node").toString();

  // Linux-specific signals
  process.on("SIGUSR2", () => {
    console.log("Received SIGUSR2 — dumping heap");
    execSync("kill -USR1 " + process.pid);
  });

  // Hardcoded Linux paths
  const logDir = "/var/log/myapp";
  const pidFile = "/var/run/myapp.pid";
  const configDir = "/etc/myapp";

  fs.writeFileSync(pidFile, process.pid.toString());

  return { memInfo, cpuInfo, loadAvg, diskUsage };
}`,
    expectedRuleIds: ["PORTA-001"],
    category: "portability",
    difficulty: "medium",
  },
  {
    id: "porta-deep-env-specific-docker",
    description: "Dockerfile assuming specific host environment",
    language: "dockerfile",
    code: `FROM node:18

# Assumes x86_64 architecture — fails on ARM (Apple Silicon, Graviton)
RUN wget https://example.com/binary-linux-x86_64 -O /usr/local/bin/mytool
RUN chmod +x /usr/local/bin/mytool

# Hardcoded UID/GID that may conflict with host
RUN useradd -u 1000 -g 1000 appuser

# Mounts host-specific paths
VOLUME /mnt/nfs-share
VOLUME /dev/sda1

# Assumes specific network configuration
RUN echo "nameserver 10.0.0.1" > /etc/resolv.conf

# Uses apt-get for Debian — won't work with Alpine base
RUN apt-get update && apt-get install -y \\
    libpng-dev \\
    libjpeg-dev

# Hardcoded timezone — should use TZ env var
RUN ln -sf /usr/share/zoneinfo/America/New_York /etc/localtime

WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]`,
    expectedRuleIds: ["PORTA-001"],
    category: "portability",
    difficulty: "hard",
  },

  // Additional mixed cases for underrepresented judges
  {
    id: "comp-deep-cookie-consent-bypass",
    description: "Tracking cookies set before user consent",
    language: "typescript",
    code: `export function initializeApp() {
  // Set tracking cookies BEFORE showing consent banner
  document.cookie = "tracking_id=" + generateId() + "; max-age=31536000; path=/";
  document.cookie = "user_fingerprint=" + fingerprint() + "; max-age=31536000; path=/";
  document.cookie = "ad_preferences=" + JSON.stringify(getAdPrefs()) + "; max-age=31536000; path=/";

  // Start tracking immediately
  window.gtag("config", "GA-XXXXX", {
    send_page_view: true,
    cookie_flags: "SameSite=None;Secure",
  });

  // Show consent banner (but tracking already started)
  setTimeout(() => {
    showConsentBanner();
  }, 2000);

  // Even if user declines, cookies already set
  // No mechanism to delete tracking cookies on decline
}`,
    expectedRuleIds: [],
    category: "compliance",
    difficulty: "medium",
  },
  {
    id: "ethics-deep-deceptive-countdown",
    description: "Deceptive subscription cancellation flow with fake countdown",
    language: "typescript",
    code: `export function CancellationFlow({ userId }: { userId: string }) {
  const [step, setStep] = useState(0);

  const steps = [
    // Step 1: Emotional manipulation
    () => (
      <div>
        <h2>We'll miss you! 😢</h2>
        <p>Are you really sure? Your team of 12 relies on this account.</p>
        <button onClick={() => setStep(1)}>I still want to cancel</button>
        <button onClick={() => window.location.href = "/dashboard"}
          style={{ background: "green", color: "white", fontSize: "18px" }}>
          Keep my account!
        </button>
      </div>
    ),
    // Step 2: Fake special offer
    () => (
      <div>
        <h2>Wait! Exclusive offer just for you</h2>
        <p>⏰ 50% off for 6 months — offer expires in <FakeCounter initial={300} /></p>
        <button onClick={() => setStep(2)} style={{ fontSize: "10px", color: "#999" }}>
          No thanks, continue cancellation
        </button>
      </div>
    ),
    // Step 3: Survey (required, 20 questions)
    // Step 4: "Processing" with 60-second fake wait
    // Step 5: Final "Are you sure?" with pre-checked "pause instead" option
    // Step 6: "Cancellation scheduled for end of billing period" (30 days away)
  ];

  return steps[step]?.() || <div>Processing...</div>;
}`,
    expectedRuleIds: ["ETHICS-001"],
    category: "ethics",
    difficulty: "medium",
  },
  {
    id: "a11y-deep-image-carousel-no-alt",
    description: "Image carousel with no alt text and auto-rotation",
    language: "typescript",
    code: `export function ImageCarousel({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    // Auto-rotates every 3 seconds — pauses for no one
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % images.length);
    }, 3000);
    return () => clearInterval(timer);
    // No pause button
    // No respect for prefers-reduced-motion
  }, [images.length]);

  return (
    <div className="carousel">
      <img src={images[current]} style={{ width: "100%" }} />
      {/* No alt text on images */}
      <div
        onClick={() => setCurrent(prev => (prev - 1 + images.length) % images.length)}
        style={{ cursor: "pointer", position: "absolute", left: "10px" }}
      >
        ◀
      </div>
      <div
        onClick={() => setCurrent(prev => (prev + 1) % images.length)}
        style={{ cursor: "pointer", position: "absolute", right: "10px" }}
      >
        ▶
      </div>
      {/* Navigation arrows are divs, not buttons */}
      {/* No keyboard support */}
      {/* No live region announcing slide changes */}
      <div className="dots">
        {images.map((_, i) => (
          <span
            key={i}
            style={{ color: i === current ? "black" : "gray" }}
            onClick={() => setCurrent(i)}
          >●</span>
        ))}
      </div>
    </div>
  );
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "hard",
  },
  {
    id: "i18n-deep-locale-dependent-sorting",
    description: "String sorting without locale-aware collation",
    language: "typescript",
    code: `export function sortNames(names: string[]): string[] {
  return names.sort();
  // JavaScript default sort uses UTF-16 code unit order
  // "Ä" sorts after "Z" instead of near "A" (German)
  // "ñ" sorts after all ASCII (Spanish)
  // "å" sorts wrong (Swedish: å comes after ö)
}

export function searchFilter(items: Item[], query: string): Item[] {
  const lower = query.toLowerCase();
  return items.filter(item =>
    item.name.toLowerCase().includes(lower)
  );
  // toLowerCase() doesn't handle Turkish İ/i dotted/dotless correctly
  // Turkish: "I".toLowerCase() should be "ı" not "i"
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
  // Locale-unaware comparison
  // Should use Intl.Collator for proper locale ordering
}`,
    expectedRuleIds: [],
    category: "internationalization",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLEAN compliance/ethics cases — FP validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "clean-comp-gdpr-compliant-api",
    description: "Clean: GDPR-compliant user data API with consent management",
    language: "typescript",
    code: `import { z } from "zod";
import { auditLog } from "./audit";

const ConsentSchema = z.object({
  marketing: z.boolean(),
  analytics: z.boolean(),
  thirdPartySharing: z.boolean(),
  dataRetentionAck: z.boolean(),
});

export async function registerUser(data: RegistrationInput) {
  const consent = ConsentSchema.parse(data.consent);

  const user = await db.users.create({
    email: data.email,
    name: data.name,
    consent: {
      marketing: consent.marketing,
      analytics: consent.analytics,
      thirdPartySharing: consent.thirdPartySharing,
      consentedAt: new Date(),
      ipAddress: maskIP(data.ip),
    },
    dataRetention: {
      policy: "36_months",
      reviewDate: addMonths(new Date(), 36),
    },
  });

  await auditLog.record({
    action: "USER_REGISTERED",
    userId: user.id,
    details: { consentGiven: consent },
    performedBy: "self-registration",
  });

  if (consent.analytics) {
    await analytics.identify(user.id, {
      // Only pseudonymized data
      segment: user.segment,
      region: user.region,
    });
  }

  return { userId: user.id, message: "Account created" };
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-comp-pci-tokenized",
    description: "Clean: PCI-DSS compliant payment processing with tokenization",
    language: "typescript",
    code: `import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function processPayment(
  paymentMethodId: string,
  amount: number,
  currency: string,
  userId: string
) {
  // Card details never touch our server — handled by Stripe tokenization
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    payment_method: paymentMethodId,
    confirm: true,
    metadata: { userId },
    return_url: process.env.RETURN_URL!,
  });

  // Store only non-sensitive reference
  await db.payments.insert({
    userId,
    stripePaymentId: paymentIntent.id,
    amount,
    currency,
    status: paymentIntent.status,
    last4: paymentIntent.payment_method_types?.[0] || "unknown",
    createdAt: new Date(),
  });

  return {
    paymentId: paymentIntent.id,
    status: paymentIntent.status,
  };
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-comp-audit-trail",
    description: "Clean: Comprehensive audit trail for admin operations",
    language: "typescript",
    code: `import { z } from "zod";

interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  performedBy: string;
  targetResource: string;
  targetId: string;
  details: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason: string;
  };
  ipAddress: string;
  userAgent: string;
}

export class AuditedAdminService {
  constructor(
    private db: Database,
    private auditLog: AuditLogger,
  ) {}

  async deleteUser(adminId: string, userId: string, reason: string, context: RequestContext) {
    const existing = await this.db.users.findById(userId);
    if (!existing) throw new NotFoundError("User not found");

    await this.db.transaction(async (tx) => {
      await tx.users.softDelete(userId);

      await this.auditLog.record({
        action: "USER_DELETED",
        performedBy: adminId,
        targetResource: "users",
        targetId: userId,
        details: {
          before: { status: existing.status, email: maskEmail(existing.email) },
          after: { status: "deleted" },
          reason,
        },
        ipAddress: context.ip,
        userAgent: context.userAgent,
      });
    });
  }

  async modifyFinancialRecord(
    adminId: string,
    recordId: string,
    newAmount: number,
    reason: string,
    approvedBy: string,
    context: RequestContext
  ) {
    const existing = await this.db.financialRecords.findById(recordId);

    await this.db.transaction(async (tx) => {
      await tx.financialRecords.update(recordId, { amount: newAmount });
      await tx.financialRecordVersions.insert({
        recordId,
        previousAmount: existing.amount,
        newAmount,
        changedBy: adminId,
        approvedBy,
        reason,
      });

      await this.auditLog.record({
        action: "FINANCIAL_RECORD_MODIFIED",
        performedBy: adminId,
        targetResource: "financial_records",
        targetId: recordId,
        details: {
          before: { amount: existing.amount },
          after: { amount: newAmount },
          reason,
        },
        ipAddress: context.ip,
        userAgent: context.userAgent,
      });
    });
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-a11y-accessible-form",
    description: "Clean: Fully accessible form with proper ARIA and keyboard support",
    language: "html",
    code: `<form action="/register" method="POST" aria-labelledby="form-title" novalidate>
  <h2 id="form-title">Create an Account</h2>

  <div class="form-group">
    <label for="firstName">First Name <span aria-hidden="true">*</span></label>
    <input type="text" id="firstName" name="firstName" required
           aria-required="true" aria-describedby="firstName-help"
           autocomplete="given-name" />
    <span id="firstName-help" class="help-text">Enter your legal first name</span>
  </div>

  <div class="form-group">
    <label for="email">Email Address <span aria-hidden="true">*</span></label>
    <input type="email" id="email" name="email" required
           aria-required="true" aria-describedby="email-error"
           autocomplete="email" />
    <span id="email-error" class="error-text" role="alert" aria-live="polite"></span>
  </div>

  <div class="form-group">
    <label for="password">Password <span aria-hidden="true">*</span></label>
    <input type="password" id="password" name="password" required
           aria-required="true" aria-describedby="password-requirements"
           autocomplete="new-password" minlength="8" />
    <div id="password-requirements" class="help-text">
      Must be at least 8 characters with one uppercase, one number, and one symbol.
    </div>
  </div>

  <div class="form-group">
    <label for="country">Country</label>
    <select id="country" name="country" autocomplete="country">
      <option value="">Select your country</option>
      <option value="us">United States</option>
      <option value="uk">United Kingdom</option>
    </select>
  </div>

  <button type="submit">Create Account</button>
</form>`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-i18n-proper-localization",
    description: "Clean: Proper internationalization with ICU message format",
    language: "typescript",
    code: `import { IntlMessageFormat } from "intl-messageformat";

const messages: Record<string, Record<string, string>> = {
  en: {
    "cart.title": "Shopping Cart",
    "cart.items": "{count, plural, =0 {No items} one {1 item} other {# items}} in your cart",
    "cart.total": "Total: {total, number, ::currency/USD}",
    "cart.checkout": "Proceed to Checkout",
  },
  de: {
    "cart.title": "Warenkorb",
    "cart.items": "{count, plural, =0 {Keine Artikel} one {1 Artikel} other {# Artikel}} in Ihrem Warenkorb",
    "cart.total": "Gesamt: {total, number, ::currency/EUR}",
    "cart.checkout": "Zur Kasse gehen",
  },
  ja: {
    "cart.title": "ショッピングカート",
    "cart.items": "カートに{count}個の商品があります",
    "cart.total": "合計: {total, number, ::currency/JPY}",
    "cart.checkout": "レジに進む",
  },
};

export function t(key: string, locale: string, values?: Record<string, unknown>): string {
  const template = messages[locale]?.[key] || messages.en[key] || key;
  if (!values) return template;
  return new IntlMessageFormat(template, locale).format(values) as string;
}

export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatCurrency(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-ethics-fair-pricing",
    description: "Clean: Fair pricing algorithm without discriminatory factors",
    language: "python",
    code: `from dataclasses import dataclass
from typing import Optional

@dataclass
class PricingFactors:
    base_rate: float
    risk_score: float  # Based on objective, non-discriminatory factors
    coverage_level: str
    deductible: float
    claim_history_years: int
    claims_count: int

def calculate_premium(factors: PricingFactors) -> float:
    """
    Calculate insurance premium based on objective risk factors only.
    Prohibited factors (per fair lending/insurance laws):
    - Race, ethnicity, national origin
    - Gender, sexual orientation
    - Religion
    - Disability status
    - Marital status (in some jurisdictions)
    """
    rate = factors.base_rate

    # Coverage level multiplier
    coverage_multipliers = {
        "basic": 1.0,
        "standard": 1.5,
        "premium": 2.0,
    }
    rate *= coverage_multipliers.get(factors.coverage_level, 1.0)

    # Deductible discount (higher deductible = lower premium)
    if factors.deductible >= 2000:
        rate *= 0.8
    elif factors.deductible >= 1000:
        rate *= 0.9

    # Claims history (objective, gender-neutral factor)
    if factors.claims_count == 0 and factors.claim_history_years >= 3:
        rate *= 0.85  # No-claims discount

    return round(rate, 2)`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-ux-consistent-errors",
    description: "Clean: Consistent error response format across all endpoints",
    language: "typescript",
    code: `interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
  requestId: string;
}

function createError(
  code: string,
  message: string,
  details?: Record<string, string[]>
): ApiError {
  return {
    code,
    message,
    details,
    requestId: crypto.randomUUID(),
  };
}

export const errorMiddleware = (
  err: Error,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  if (err instanceof ValidationError) {
    return res.status(400).json(
      createError("VALIDATION_ERROR", "Invalid input provided", err.details)
    );
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json(
      createError("NOT_FOUND", err.message)
    );
  }
  if (err instanceof ConflictError) {
    return res.status(409).json(
      createError("CONFLICT", err.message)
    );
  }

  // Never expose internal details
  console.error("Unhandled error:", err);
  return res.status(500).json(
    createError("INTERNAL_ERROR", "An unexpected error occurred. Please try again later.")
  );
};`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-compat-versioned-api",
    description: "Clean: Versioned API with backward compatibility",
    language: "typescript",
    code: `import express from "express";

const app = express();

// API versioning via URL path
const v1Router = express.Router();
const v2Router = express.Router();

// V1: Original response format (maintained for backward compatibility)
v1Router.get("/users/:id", async (req, res) => {
  const user = await db.findUser(req.params.id);
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
  });
});

// V2: Enhanced response format with envelope
v2Router.get("/users/:id", async (req, res) => {
  const user = await db.findUser(req.params.id);
  res.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
    meta: {
      apiVersion: "v2",
      deprecations: [],
    },
  });
});

app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);

// Deprecation warning for v1
app.use("/api/v1", (req, res, next) => {
  res.setHeader("Deprecation", "true");
  res.setHeader("Sunset", "2025-06-01");
  res.setHeader("Link", '</api/v2>; rel="successor-version"');
  next();
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-deps-well-maintained",
    description: "Clean: Well-maintained dependencies with precise version pinning",
    language: "json",
    code: `{
  "name": "production-api",
  "version": "2.0.0",
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  },
  "dependencies": {
    "express": "4.18.2",
    "zod": "3.22.4",
    "drizzle-orm": "0.29.3",
    "pg": "8.11.3",
    "ioredis": "5.3.2",
    "pino": "8.17.2",
    "helmet": "7.1.0",
    "cors": "2.8.5",
    "jsonwebtoken": "9.0.2",
    "bcryptjs": "2.4.3"
  },
  "devDependencies": {
    "typescript": "5.3.3",
    "vitest": "1.2.1",
    "@types/express": "4.17.21",
    "@types/node": "20.11.5",
    "eslint": "8.56.0"
  },
  "overrides": {
    "semver": ">=7.5.4"
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-porta-cross-platform-paths",
    description: "Clean: Cross-platform file path handling",
    language: "typescript",
    code: `import path from "path";
import os from "os";
import fs from "fs/promises";

export function getAppDataDir(): string {
  const appName = "myapp";
  switch (process.platform) {
    case "win32":
      return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", appName);
    default:
      return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), appName);
  }
}

export function getLogDir(): string {
  return path.join(getAppDataDir(), "logs");
}

export function getTempDir(): string {
  return path.join(os.tmpdir(), "myapp");
}

export async function writeLog(message: string): Promise<void> {
  const logDir = getLogDir();
  await fs.mkdir(logDir, { recursive: true });
  const logFile = path.join(logDir, "app.log");
  await fs.appendFile(logFile, message + os.EOL);
}

export async function loadConfig(): Promise<Record<string, unknown>> {
  const configPath = path.join(getAppDataDir(), "config.json");
  const content = await fs.readFile(configPath, "utf-8");
  return JSON.parse(content);
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-a11y-accessible-dropdown",
    description: "Clean: Custom dropdown with full keyboard and screen reader support",
    language: "typescript",
    code: `export function AccessibleDropdown({ options, onSelect, label }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(options[0]);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setActiveIndex((prev) => Math.min(prev + 1, options.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (isOpen) {
          setSelected(options[activeIndex]);
          onSelect(options[activeIndex].value);
          setIsOpen(false);
        } else {
          setIsOpen(true);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="dropdown" onKeyDown={handleKeyDown}>
      <label id="dropdown-label">{label}</label>
      <button
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby="dropdown-label"
        aria-activedescendant={isOpen ? \`option-\${activeIndex}\` : undefined}
        onClick={() => setIsOpen(!isOpen)}
        tabIndex={0}
      >
        {selected.label}
      </button>
      {isOpen && (
        <ul role="listbox" ref={listRef} aria-labelledby="dropdown-label">
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              id={\`option-\${idx}\`}
              role="option"
              aria-selected={idx === activeIndex}
              onClick={() => {
                setSelected(opt);
                onSelect(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-sov-region-aware-storage",
    description: "Clean: Region-aware data storage with sovereignty compliance",
    language: "typescript",
    code: `interface RegionConfig {
  bucket: string;
  region: string;
  encryptionKeyId: string;
}

const REGION_CONFIGS: Record<string, RegionConfig> = {
  EU: {
    bucket: "eu-west-1-user-data",
    region: "eu-west-1",
    encryptionKeyId: "alias/eu-data-key",
  },
  US: {
    bucket: "us-east-1-user-data",
    region: "us-east-1",
    encryptionKeyId: "alias/us-data-key",
  },
  APAC: {
    bucket: "ap-southeast-1-user-data",
    region: "ap-southeast-1",
    encryptionKeyId: "alias/apac-data-key",
  },
};

export async function storeUserData(
  userId: string,
  userRegion: string,
  data: UserData
): Promise<void> {
  const config = REGION_CONFIGS[userRegion];
  if (!config) {
    throw new Error(\`No storage configuration for region: \${userRegion}\`);
  }

  const s3 = new S3Client({ region: config.region });

  await s3.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: \`users/\${userId}/profile.json\`,
    Body: JSON.stringify(data),
    ServerSideEncryption: "aws:kms",
    SSEKMSKeyId: config.encryptionKeyId,
    Metadata: {
      "data-residency": userRegion,
      "encryption-standard": "AES-256-KMS",
    },
  }));

  await auditLog.record({
    action: "USER_DATA_STORED",
    userId,
    region: config.region,
    bucket: config.bucket,
  });
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-comp-data-retention",
    description: "Clean: Data retention policy with automatic cleanup",
    language: "typescript",
    code: `interface RetentionPolicy {
  table: string;
  retentionDays: number;
  dateColumn: string;
  anonymize?: string[];
  softDelete?: boolean;
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  { table: "activity_logs", retentionDays: 90, dateColumn: "created_at" },
  { table: "session_recordings", retentionDays: 30, dateColumn: "recorded_at" },
  { table: "audit_logs", retentionDays: 2555, dateColumn: "timestamp" }, // 7 years for compliance
  {
    table: "user_profiles",
    retentionDays: 1095, // 3 years after account deletion
    dateColumn: "deleted_at",
    anonymize: ["email", "phone", "address"],
    softDelete: true,
  },
];

export async function enforceRetention(db: Database): Promise<RetentionReport> {
  const report: RetentionReport = { processed: [], errors: [] };

  for (const policy of RETENTION_POLICIES) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

      if (policy.anonymize) {
        const anonymizeSet = policy.anonymize
          .map((col) => \`\${col} = 'REDACTED'\`)
          .join(", ");
        const result = await db.query(
          \`UPDATE \${policy.table} SET \${anonymizeSet} WHERE \${policy.dateColumn} < $1 AND email != 'REDACTED'\`,
          [cutoffDate]
        );
        report.processed.push({ table: policy.table, action: "anonymized", count: result.rowCount });
      } else {
        const result = await db.query(
          \`DELETE FROM \${policy.table} WHERE \${policy.dateColumn} < $1\`,
          [cutoffDate]
        );
        report.processed.push({ table: policy.table, action: "deleted", count: result.rowCount });
      }
    } catch (error) {
      report.errors.push({ table: policy.table, error: String(error) });
    }
  }

  return report;
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-a11y-video-accessible",
    description: "Clean: Accessible video player with captions and keyboard controls",
    language: "typescript",
    code: `export function AccessibleVideoPlayer({ src, title, captionsSrc, transcriptUrl }: VideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  return (
    <div role="region" aria-label={\`Video: \${title}\`}>
      <video
        ref={videoRef}
        src={src}
        controls
        aria-label={title}
        preload="metadata"
      >
        <track
          kind="captions"
          src={captionsSrc}
          srcLang="en"
          label="English Captions"
          default
        />
        <track
          kind="descriptions"
          src={captionsSrc.replace(".vtt", "-descriptions.vtt")}
          srcLang="en"
          label="Audio Descriptions"
        />
        Your browser does not support the video tag.
      </video>
      <div className="video-controls">
        <button aria-label="Play/Pause" onClick={() => {
          videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause();
        }}>
          ⏯
        </button>
        <a href={transcriptUrl} target="_blank" rel="noopener">
          View Full Transcript
        </a>
      </div>
    </div>
  );
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-i18n-rtl-support",
    description: "Clean: Proper RTL layout support with logical properties",
    language: "typescript",
    code: `export function ChatBubble({ message, isSent, dir }: ChatBubbleProps) {
  return (
    <div
      dir={dir}
      style={{
        display: "flex",
        justifyContent: isSent ? "flex-end" : "flex-start",
        marginInlineStart: isSent ? "40px" : "0",
        marginInlineEnd: isSent ? "0" : "40px",
      }}
    >
      <div
        style={{
          background: isSent ? "#007bff" : "#e9ecef",
          borderStartStartRadius: "18px",
          borderStartEndRadius: "18px",
          borderEndStartRadius: isSent ? "18px" : "4px",
          borderEndEndRadius: isSent ? "4px" : "18px",
          padding: "8px 16px",
          textAlign: "start",
        }}
      >
        {message.text}
        <div style={{ fontSize: "11px", textAlign: "end" }}>
          {new Intl.DateTimeFormat(message.locale, {
            hour: "numeric",
            minute: "numeric",
          }).format(message.timestamp)}
        </div>
      </div>
    </div>
  );
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-ethics-transparent-algo",
    description: "Clean: Transparent content recommendation with user control",
    language: "typescript",
    code: `export class TransparentRecommender {
  async getRecommendations(userId: string, preferences: UserPreferences) {
    const recommendations = await this.engine.recommend({
      userId,
      factors: {
        interests: preferences.selectedTopics,
        recency: preferences.preferRecent ? 0.8 : 0.3,
        diversity: preferences.diversityLevel,
      },
      excludeFactors: [
        "demographics",
        "inferredIncome",
        "locationHistory",
      ],
    });

    return {
      items: recommendations.map(rec => ({
        ...rec,
        whyRecommended: rec.explanation,
        confidenceScore: rec.score,
      })),
      controls: {
        canDismiss: true,
        canBlockTopic: true,
        canAdjustWeights: true,
        dataUsedUrl: "/settings/recommendation-data",
        optOutUrl: "/settings/disable-recommendations",
      },
    };
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-compat-graceful-deprecation",
    description: "Clean: Graceful API deprecation with migration timeline",
    language: "typescript",
    code: `import { Router } from "express";

export function deprecatedRoute(
  router: Router,
  oldPath: string,
  newPath: string,
  sunsetDate: string
) {
  router.all(oldPath, (req, res, next) => {
    res.setHeader("Deprecation", \`date="\${sunsetDate}"\`);
    res.setHeader("Sunset", sunsetDate);
    res.setHeader("Link", \`<\${newPath}>; rel="successor-version"\`);

    console.warn(\`Deprecated endpoint accessed: \${oldPath} by client \${req.get("User-Agent")}\`);

    // Still serve the request — don't break existing clients
    next();
  });
}

// Usage
const v1 = Router();
const v2 = Router();

deprecatedRoute(v1, "/api/v1/users", "/api/v2/users", "2025-12-31");

v1.get("/api/v1/users/:id", async (req, res) => {
  const user = await db.findUser(req.params.id);
  // Transform to v1 format for backward compatibility
  res.json({ id: user.id, name: user.name, email: user.email });
});

v2.get("/api/v2/users/:id", async (req, res) => {
  const user = await db.findUser(req.params.id);
  res.json({
    data: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
    meta: { apiVersion: "v2" },
  });
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-porta-cross-platform-scripts",
    description: "Clean: Cross-platform npm scripts using cross-env",
    language: "json",
    code: `{
  "name": "cross-platform-app",
  "scripts": {
    "clean": "rimraf dist",
    "prebuild": "mkdirp dist/assets && cpy 'static/**' dist/assets",
    "build": "cross-env NODE_ENV=production webpack --config webpack.prod.js",
    "start": "cross-env PORT=3000 node dist/server.js",
    "dev": "cross-env DEBUG=app:* nodemon src/server.ts",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "cross-env": "7.0.3",
    "rimraf": "5.0.5",
    "mkdirp": "3.0.1",
    "cpy-cli": "5.0.0"
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-ux-proper-loading-states",
    description: "Clean: Async operations with proper loading, error, and success states",
    language: "typescript",
    code: `export function PaymentForm() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("loading");
    setError(null);

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        body: JSON.stringify({ amount: 99.99 }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Payment failed");
      }

      setState("success");
      setTimeout(() => window.location.href = "/success", 1500);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" name="cardNumber" disabled={state === "loading"} />
      <button
        type="submit"
        disabled={state === "loading"}
        aria-busy={state === "loading"}
      >
        {state === "loading" ? "Processing..." : "Pay $99.99"}
      </button>
      {state === "error" && (
        <div role="alert" className="error-message">{error}</div>
      )}
      {state === "success" && (
        <div role="status" className="success-message">Payment successful! Redirecting...</div>
      )}
    </form>
  );
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
];
