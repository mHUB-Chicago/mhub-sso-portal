import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Address, BillingDetails, PaymentType } from "../types";

type BillingTextField = keyof Omit<BillingDetails, "address" | "paymentType">;

interface BillingStepProps {
  value: BillingDetails;
  onChange: (field: BillingTextField, fieldValue: string) => void;
  onAddressChange: (field: keyof Address, fieldValue: string) => void;
  onPaymentTypeChange: (paymentType: PaymentType) => void;
}

const digitsOnly = (input: string) => input.replace(/\D/g, "");

export const BillingStep = ({ value, onChange, onAddressChange, onPaymentTypeChange }: BillingStepProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Billing Information</h2>
        <p className="text-gray-600">
          Collected to pass to PeopleVine. No payment is processed in this portal.
        </p>
      </div>

      <div>
        <Label>Payment Type</Label>
        <div className="mt-1 inline-flex overflow-hidden rounded-md border border-gray-300">
          <button
            type="button"
            onClick={() => onPaymentTypeChange("card")}
            className={cn(
              "px-4 py-2 text-sm font-medium",
              value.paymentType === "card" ? "bg-brand text-white" : "bg-white text-gray-600"
            )}
          >
            Credit Card
          </button>
          <button
            type="button"
            onClick={() => onPaymentTypeChange("bank")}
            className={cn(
              "px-4 py-2 text-sm font-medium",
              value.paymentType === "bank" ? "bg-brand text-white" : "bg-white text-gray-600"
            )}
          >
            Bank Transfer
          </button>
        </div>
      </div>

      {value.paymentType === "card" ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="nameOnCard">Name on Card</Label>
            <Input
              id="nameOnCard"
              autoComplete="cc-name"
              value={value.nameOnCard}
              onChange={(e) => onChange("nameOnCard", e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="cardNumber">Card Number</Label>
            <Input
              id="cardNumber"
              inputMode="numeric"
              autoComplete="cc-number"
              maxLength={16}
              value={value.cardNumber}
              onChange={(e) => onChange("cardNumber", digitsOnly(e.target.value))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cardExpiration">Expiration</Label>
            <Input
              id="cardExpiration"
              placeholder="MM / YY"
              autoComplete="cc-exp"
              maxLength={7}
              value={value.expiration}
              onChange={(e) => onChange("expiration", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cardCvc">CVC</Label>
            <Input
              id="cardCvc"
              type="password"
              inputMode="numeric"
              autoComplete="cc-csc"
              maxLength={4}
              value={value.cvc}
              onChange={(e) => onChange("cvc", digitsOnly(e.target.value))}
              className="mt-1"
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Bank transfer details are collected by PeopleVine directly once available via the API.
        </p>
      )}

      <div className="space-y-3">
        <Label>Billing Address</Label>
        <Input
          placeholder="Street address"
          autoComplete="street-address"
          value={value.address.street}
          onChange={(e) => onAddressChange("street", e.target.value)}
        />
        <div className="grid grid-cols-3 gap-4">
          <Input
            placeholder="City"
            autoComplete="address-level2"
            value={value.address.city}
            onChange={(e) => onAddressChange("city", e.target.value)}
          />
          <Input
            placeholder="State"
            autoComplete="address-level1"
            value={value.address.state}
            onChange={(e) => onAddressChange("state", e.target.value)}
          />
          <Input
            placeholder="Zip"
            autoComplete="postal-code"
            value={value.address.zip}
            onChange={(e) => onAddressChange("zip", e.target.value)}
          />
        </div>
        <Input
          placeholder="Country"
          autoComplete="country-name"
          value={value.address.country}
          onChange={(e) => onAddressChange("country", e.target.value)}
        />
      </div>
    </div>
  );
};
