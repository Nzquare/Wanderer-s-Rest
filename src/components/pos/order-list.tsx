import { Card } from "@/components/ui/card";

interface OrderItemModifier {
  id: string;
  nameSnapshotEn: string;
}
interface OrderItemComboSelection {
  id: string;
  slotNameSnapshotEn: string;
  nameSnapshotEn: string;
}
interface OrderItem {
  id: string;
  nameSnapshotEn: string;
  quantity: number;
  unitPriceSnapshot: unknown;
  modifiers: OrderItemModifier[];
  comboSelections?: OrderItemComboSelection[];
}
interface Order {
  id: string;
  source: "CASHIER" | "STAFF" | "CUSTOMER_QR";
  createdAt: string | Date;
  items: OrderItem[];
}

const SOURCE_LABEL: Record<Order["source"], string> = {
  CASHIER: "Cashier",
  STAFF: "Staff",
  CUSTOMER_QR: "Customer (QR)",
};

export function OrderList({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No food/drink orders yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <Card key={order.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              {SOURCE_LABEL[order.source]}
            </span>
            <span className="text-xs text-foreground-muted">
              {new Date(order.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-foreground">
                {item.quantity} × {item.nameSnapshotEn}
                {(item.modifiers.length > 0 || (item.comboSelections?.length ?? 0) > 0) && (
                  <span className="text-foreground-muted">
                    {" "}
                    (
                    {[
                      ...item.modifiers.map((m) => m.nameSnapshotEn),
                      ...(item.comboSelections ?? []).map(
                        (cs) => `${cs.slotNameSnapshotEn}: ${cs.nameSnapshotEn}`,
                      ),
                    ].join(", ")}
                    )
                  </span>
                )}
              </span>
              <span className="tabular-nums text-foreground-muted">
                ฿{Number(item.unitPriceSnapshot) * item.quantity}
              </span>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
