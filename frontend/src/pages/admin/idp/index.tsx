import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table/data-table"
import { serviceProviderColumns } from "@/components/data-table/columns"
import { Loader2, Plus } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { useGetServiceProvidersQuery } from "@/store/api/serviceProviderApi"

const PAGE_SIZE = 10

export function IDPManagementPage() {
  const navigate = useNavigate()
  // IDP uses client-side pagination (typically few service providers)
  const { data, isLoading, error } = useGetServiceProvidersQuery()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load applications</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const serviceProviders = data?.data?.serviceProviders || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <nav className="text-sm text-gray-500 mb-2">
            <Link to="/admin/users" className="hover:text-gray-700 cursor-pointer">Home</Link>
            <span className="mx-1">›</span>
            <span className="font-semibold text-gray-900">IDP Management</span>
          </nav>
          <h1 className="text-2xl font-bold">IDP Management</h1>
        </div>
        <Button
          onClick={() => navigate('/admin/idp/add')}
          className="bg-[#D30046] hover:bg-[#B8003C]"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Application
        </Button>
      </div>

      {/* Data Table */}
      <DataTable
        columns={serviceProviderColumns}
        data={serviceProviders}
        searchPlaceholder="Search applications..."
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
