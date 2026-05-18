import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { Company } from "@/store/api/userApi"

interface Props {
  company: Company
  open: boolean
  onClose: () => void
}

export function CompanyViewModal({ company, open, onClose }: Props) {
  const initials = company.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle>{company.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">{company.email}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm pt-2">
          <div>
            <p className="text-muted-foreground">Membership</p>
            <p className="font-medium">{company.membershipTypes.length > 0 ? company.membershipTypes.join(', ') : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <Badge variant={company.active ? "default" : "outline"}>{company.active ? "Active" : "Inactive"}</Badge>
          </div>
          <div>
            <p className="text-muted-foreground">Account Type</p>
            <p className="font-medium">{company.isPersonal ? "Personal" : "Company"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">PeopleVine ID</p>
            <p className="font-medium">{company.peopleVineId || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created</p>
            <p className="font-medium">{new Date(company.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Updated</p>
            <p className="font-medium">{new Date(company.updatedAt).toLocaleDateString()}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
