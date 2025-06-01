pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    PROMETHEUS_VERSION = "v0.12.0" // Version stable de kube-prometheus
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

    stage('Configure K3s Access') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              mkdir -p ~/.kube
              cp "$KUBECONFIG_FILE" ~/.kube/config
              chmod 600 ~/.kube/config
              kubectl get nodes
              kubectl create namespace $KUBE_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh 'kubectl apply -f k8s/bibliotheque-auth-deployment.yaml -n $KUBE_NAMESPACE'
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              echo "=== Deployment Status ==="
              kubectl get deploy -n $KUBE_NAMESPACE
              echo "=== Service Details ==="
              kubectl get svc -n $KUBE_NAMESPACE
              echo "=== Pods Status ==="
              kubectl get pods -n $KUBE_NAMESPACE
              
              echo "Application accessible via:"
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
              echo "http://$NODE_IP:$NODE_PORT"
            '''
          }
        }
      }
    }

    stage('Basic Monitoring Setup') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            try {
              sh """
                # Création du namespace monitoring
                kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
                
                # Installation des CRDs
                kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/kube-prometheus/${PROMETHEUS_VERSION}/manifests/setup
                
                # Attente que les CRDs soient installés
                until kubectl get servicemonitors --all-namespaces ; do sleep 1; done
                
                # Installation des composants principaux
                kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/kube-prometheus/${PROMETHEUS_VERSION}/manifests/
                
                # Exposition des services
                kubectl patch svc prometheus-k8s -n monitoring -p '{"spec": {"type": "NodePort", "ports": [{"nodePort": 30900, "port": 9090, "targetPort": 9090}]}}'
                kubectl patch svc grafana -n monitoring -p '{"spec": {"type": "NodePort", "ports": [{"nodePort": 30300, "port": 3000, "targetPort": 3000}]}}'
                
                echo "Monitoring installed:"
                echo "Prometheus: http://\$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'):30900"
                echo "Grafana: http://\$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'):30300"
                echo "Grafana admin password: \$(kubectl get secret grafana-admin -n monitoring -o jsonpath='{.data.GF_SECURITY_ADMIN_PASSWORD}' | base64 --decode)"
              """
            } catch (Exception e) {
              echo "Monitoring setup partially failed: ${e.getMessage()}"
              currentBuild.result = 'UNSTABLE'
            }
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            echo "Attempting rollback..."
            kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
            kubectl rollout status deployment/bibliotheque-auth -n $KUBE_NAMESPACE --timeout=60s || true
            echo "Cleaning monitoring resources..."
            kubectl delete namespace monitoring --ignore-not-found=true || true
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}