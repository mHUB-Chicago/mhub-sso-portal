import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table/data-table"
import { userColumns, type User } from "@/components/data-table/columns"
import { Download, Settings, UserPlus } from "lucide-react"
import { Link } from "react-router-dom"

// Mock data
const mockUsers: User[] = [
  {
    id: "1",
    fullName: "Alice Smith",
    email: "alice.s@techsol.com",
    company: "Tech Solutions Inc.",
    membership: "Premium",
    accessLevel: "Admin",
    modifiedOn: "2 hours ago",
  },
  {
    id: "2",
    fullName: "Bob Johnson",
    email: "bob.j@globalinnovations.com",
    company: "Global Innovations",
    membership: "Standard",
    accessLevel: "Editor",
    modifiedOn: "5 hours ago",
  },
  {
    id: "3",
    fullName: "Charlie Brown",
    email: "charlie.b@futuresys.io",
    company: "Future Systems Ltd.",
    membership: "Enterprise",
    accessLevel: "Viewer",
    modifiedOn: "1 day ago",
  },
  {
    id: "4",
    fullName: "Diana Prince",
    email: "diana.p@agilesoft.dev",
    company: "Agile Software Co.",
    membership: "Premium",
    accessLevel: "Admin",
    modifiedOn: "3 days ago",
  },
  {
    id: "5",
    fullName: "Eve Wilson",
    email: "eve.w@stratven.org",
    company: "Strategic Ventures",
    membership: "Standard",
    accessLevel: "Editor",
    modifiedOn: "1 week ago",
  },
  {
    id: "6",
    fullName: "Frank Miller",
    email: "frank.w@datadyn.ai",
    company: "Data Dynamics",
    membership: "Enterprise",
    accessLevel: "Viewer",
    modifiedOn: "2 weeks ago",
  },
]

export function AdminUsersPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <nav className="text-sm text-gray-500 mb-2">
          <Link to="/admin/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link> <span className="mx-1">›</span> <span className="font-semibold text-gray-900">Users</span>
        </nav>
        <h1 className="text-2xl font-bold">User Summary</h1>
      </div>
      
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <Button className="bg-[#D30046] hover:bg-[#B8003C] px-4 py-2 h-10">
          <UserPlus className="h-4 w-4 mr-2" />
          Add New User
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="px-4 py-2 h-10">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" className="px-4 py-2 h-10">
            <Settings className="h-4 w-4 mr-2" />
            View Options
          </Button>
        </div>
      </div>

      {/* User Accounts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">User Accounts</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Filter</span>
            <Button variant="ghost" size="sm" className="text-gray-600">
              Reset
            </Button>
          </div>
        </div>

        {/* Data Table */}
        <DataTable columns={userColumns} data={mockUsers} />
      </div>
    </div>
  )
}