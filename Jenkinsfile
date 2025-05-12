pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    KUBECONFIG_PATH = "${env.WORKSPACE}/kubeconfig"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

    stage('Create Kubernetes Secrets') {
      steps {
        script {
          withCredentials([
            string(credentialsId: 'JWT_SECRET_CREDENTIALS', variable: 'JWT_SECRET'),
            usernamePassword(
              credentialsId: 'DB_CREDENTIALS',
              usernameVariable: 'DB_USER',
              passwordVariable: 'DB_PASSWORD'
            )
          ]) {
            sh '''
              sed -i "s/{{JWT_SECRET}}/${JWT_SECRET}/g" k8s/secrets.yaml
              sed -i "s/{{DB_USER}}/${DB_USER}/g" k8s/secrets.yaml
              sed -i "s/{{DB_PASSWORD}}/${DB_PASSWORD}/g" k8s/secrets.yaml
              kubectl apply -f k8s/secrets.yaml --kubeconfig=${KUBECONFIG_PATH}
            '''
          }
        }
      }
    }

    stage('Configure K3s Access') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'K3S_CONFIG_FILE')]) {
            sh """
              mkdir -p ${env.WORKSPACE}
              cp "${K3S_CONFIG_FILE}" "${KUBECONFIG_PATH}"
              chmod 600 "${KUBECONFIG_PATH}"
              
              if ! kubectl --kubeconfig=${KUBECONFIG_PATH} cluster-info; then
                echo "ERREUR: Impossible de se connecter au cluster"
                exit 1
              fi
              
              kubectl --kubeconfig=${KUBECONFIG_PATH} create namespace ${KUBE_NAMESPACE} --dry-run=client -o yaml | kubectl --kubeconfig=${KUBECONFIG_PATH} apply -f -
              
              echo "=== Information du cluster ==="
              kubectl --kubeconfig=${KUBECONFIG_PATH} cluster-info
              echo "=== Noeuds disponibles ==="
              kubectl --kubeconfig=${KUBECONFIG_PATH} get nodes
            """
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'K3S_CONFIG_FILE')]) {
            sh """
              kubectl --kubeconfig=${KUBECONFIG_PATH} apply -f k8s/bibliotheque-auth-deployment.yaml --validate=false
              kubectl --kubeconfig=${KUBECONFIG_PATH} apply -f k8s/bibliotheque-auth-service.yaml --validate=false
              
              kubectl --kubeconfig=${KUBECONFIG_PATH} rollout status deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} --timeout=600s
            """
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'K3S_CONFIG_FILE')]) {
            sh """
              echo "=== Statut du déploiement ==="
              kubectl --kubeconfig=${KUBECONFIG_PATH} get deploy -n ${KUBE_NAMESPACE} -o wide
              
              echo "=== Détails du service ==="
              kubectl --kubeconfig=${KUBECONFIG_PATH} get svc -n ${KUBE_NAMESPACE}
              
              echo "=== Logs des pods ==="
              kubectl --kubeconfig=${KUBECONFIG_PATH} logs -n ${KUBE_NAMESPACE} -l app=bibliotheque-auth --tail=50 || echo "Impossible d'accéder aux logs"
              
              NODE_IP=\$(kubectl --kubeconfig=${KUBECONFIG_PATH} get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=\$(kubectl --kubeconfig=${KUBECONFIG_PATH} get svc bibliotheque-auth-service -n ${KUBE_NAMESPACE} -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "NON_DISPONIBLE")
              
              if [ "\${NODE_PORT}" != "NON_DISPONIBLE" ]; then
                echo "Application accessible à: http://\${NODE_IP}:\${NODE_PORT}"
                curl -I "http://\${NODE_IP}:\${NODE_PORT}/health" --connect-timeout 5 || echo "Le service ne répond pas encore"
              else
                echo "Service non encore disponible"
              fi
            """
          }
        }
      }
    }
  }

  post {
    always {
      sh """
        docker logout ${REGISTRY} || true
        rm -f "${KUBECONFIG_PATH}" || true
      """
      echo "Pipeline exécuté avec le statut: ${currentBuild.result}"
    }
    
    failure {
      script {
        echo "Échec du pipeline! Tentative de rollback..."
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'K3S_CONFIG_FILE')]) {
          sh """
            kubectl --kubeconfig=${KUBECONFIG_PATH} rollout undo deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} || true
            sleep 15
            kubectl --kubeconfig=${KUBECONFIG_PATH} rollout status deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} || true
            echo "=== État après rollback ==="
            kubectl --kubeconfig=${KUBECONFIG_PATH} get pods -n ${KUBE_NAMESPACE} -o wide
          """
        }
      }
    }
  }
}