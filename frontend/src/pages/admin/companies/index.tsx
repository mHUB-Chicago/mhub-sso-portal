import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table/data-table"
import { companyColumns, type CompanyWithUserCount } from "@/components/data-table/columns"
import { Download, Settings, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"
import { useGetCompaniesQuery } from "@/store/api/companyApi"
import { useGetUsersQuery } from "@/store/api/userApi"
import { useMemo } from "react"

export function AdminCompaniesPage() {
  const { data: companiesData, isLoading: companiesLoading, error: companiesError } = useGetCompaniesQuery({ limit: 100, offset: 0 })
  const { data: usersData, isLoading: usersLoading } = useGetUsersQuery({ limit: 100, offset: 0 })

  // Create a map of company IDs to user counts
  const userCountMap = useMemo(() => {
    if (!usersData?.data?.users) return new Map<string, number>()
    const counts = new Map<string, number>()
    usersData.data.users.forEach(user => {
      counts.set(user.companyId, (counts.get(user.companyId) || 0) + 1)
    })
    return counts
  }, [usersData])

  // Enrich companies with user counts
  const companiesWithUserCount: CompanyWithUserCount[] = useMemo(() => {
    if (!companiesData?.data?.companies) return []
    return companiesData.data.companies.map(company => ({
      ...company,
      userCount: userCountMap.get(company.id) || 0
    }))
  }, [companiesData, userCountMap])

  const isLoading = companiesLoading || usersLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (companiesError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load companies</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <nav className="text-sm text-gray-500 mb-2">
          <Link to="/admin/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link>
          <span className="mx-1">›</span>
          <span className="font-semibold text-gray-900">Companies</span>
        </nav>
        <h1 className="text-2xl font-bold">Company Summary</h1>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-end">
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

      {/* Companies Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Companies
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({companiesData?.data?.total || 0} total)
            </span>
          </h2>
        </div>

        {/* Data Table */}
        <DataTable
          columns={companyColumns}
          data={companiesWithUserCount}
          searchPlaceholder="Search by company name, email..."
          pageSize={10}
        />
      </div>
    </div>
  )
}
