import { describe, it, expect } from "vitest";
import appointmentRoutes from "../routes/appointment.route.js";
import billingRoutes from "../routes/billing.route.js";
import userRoutes from "../routes/user.route.js";

describe("router wiring", () => {
  it("appointment router mounts expected paths", () => {
    const paths = appointmentRoutes.stack.map((l) => l.route?.path ?? l.name ?? "").filter(Boolean);
    expect(paths.sort()).toEqual(["/availability", "/mine", ":id", "therapist", "therapist/:id/status", "/"].sort());
  });
  it("billing router mounts webhook + checkout + status + cancel", () => {
    const paths = billingRoutes.stack.map((l) => l.route?.path ?? l.name ?? "").filter(Boolean);
    expect(paths.sort()).toEqual(["/webhook", "/checkout", "/status", "/cancel"].sort());
  });
  it("user router includes therapist detail + review routes", () => {
    const paths = userRoutes.stack.map((l) => l.route?.path ?? l.name ?? "").filter(Boolean);
    expect(paths).toContain("therapists/:id");
    expect(paths).toContain("therapists/:id/reviews");
  });
});