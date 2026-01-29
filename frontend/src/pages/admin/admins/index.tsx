import { Button } from "@/components/ui/button"
import { DataTable, type FilterConfig } from "@/components/data-table/data-table"
import { adminColumns, type UserWithCompany } from "@/components/data-table/columns"
import { Download, Settings, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"
import { useGetUsersQuery } from "@/store/api/userApi"
import { useGetCompaniesQuery } from "@/store/api/companyApi"
import { useMemo, useState } from "react"

const PAGE_SIZE = 10

export function AdminManagementPage() {
  const [page, setPage] = useState(0)
  const { data: usersData, isLoading: usersLoading, error: usersError } = useGetUsersQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    role: 'ADMIN'
  })
  const { data: companiesData, isLoading: companiesLoading } = useGetCompaniesQuery({ limit: 100, offset: 0 })

  // Create a map of company IDs to names
  const companyMap = useMemo(() => {
    if (!companiesData?.data?.companies) return new Map<string, string>()
    return new Map(companiesData.data.companies.map(c => [c.id, c.name]))
  }, [companiesData])

  // Enrich users with company names
  const usersWithCompany: UserWithCompany[] = useMemo(() => {
    if (!usersData?.data?.users) return []
    return usersData.data.users.map(user => ({
      ...user,
      companyName: companyMap.get(user.companyId) || '-'
    }))
  }, [usersData, companyMap])

  // Build dynamic filters based on data
  const filters: FilterConfig[] = useMemo(() => {
    const companyOptions = companiesData?.data?.companies?.map(c => ({
      value: c.name,
      label: c.name
    })) || []

    return [
      {
        columnId: "companyName",
        placeholder: "Company",
        options: companyOptions,
        width: "w-48"
      }
    ]
  }, [companiesData])

  const isLoading = usersLoading || companiesLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (usersError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load admins</p>
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
          <Link to="/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link>
          <span className="mx-1">›</span>
          <span className="font-semibold text-gray-900">Admins</span>
        </nav>
        <h1 className="text-2xl font-bold">Admin Management</h1>
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

      {/* Admin Accounts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Admin Accounts
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({usersData?.data?.total || 0} total)
            </span>
          </h2>
        </div>

        {/* Data Table */}
        <DataTable
          columns={adminColumns}
          data={usersWithCompany}
          searchPlaceholder="Search by name, email..."
          filters={filters}
          pageSize={PAGE_SIZE}
          serverSide
          totalRows={usersData?.data?.total ?? 0}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
