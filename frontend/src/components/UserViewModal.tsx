import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { UserWithCompany } from "@/components/data-table/columns"

interface Props {
  user: UserWithCompany
  open: boolean
  onClose: () => void
}

export function UserViewModal({ user, open, onClose }: Props) {
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase()

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.profilePhoto ?? undefined} alt={user.name} className="object-cover" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle>{user.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm pt-2">
          <div>
            <p className="text-muted-foreground">Company</p>
            <p className="font-medium">{user.companyName || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Membership</p>
            <p className="font-medium">{user.membershipType || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <Badge variant={user.active ? "default" : "outline"}>{user.active ? "Active" : "Inactive"}</Badge>
          </div>
          <div>
            <p className="text-muted-foreground">Email Verified</p>
            <Badge variant={user.emailVerified ? "default" : "outline"}>{user.emailVerified ? "Verified" : "Pending"}</Badge>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p className="font-medium">{user.phone || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Card Status</p>
            <p className="font-medium">{user.cardStatus || '—'}</p>
          </div>
          {(user.address || user.city || user.state || user.zipCode) && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Address</p>
              <p className="font-medium">
                {[user.address, user.city, user.state, user.zipCode].filter(Boolean).join(', ')}
              </p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Created</p>
            <p className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Updated</p>
            <p className="font-medium">{new Date(user.updatedAt).toLocaleDateString()}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
